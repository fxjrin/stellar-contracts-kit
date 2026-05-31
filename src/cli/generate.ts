import { contract, xdr } from '@stellar/stellar-sdk'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { resolveNetwork } from '../network/config.js'
import { createServer } from '../rpc/soroban.js'
import { fetchContractSpec } from '../contract/spec.js'
import { isContractKitError } from '../errors/index.js'
import { generateOutput, generateOutputJs, generateExample, generateExampleJs, toTs } from './codegen.js'

function deriveInterfaceName(outPath: string): string {
  const base = basename(outPath, extname(outPath))
  return base
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function nameToKebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

function detectAliasImport(outPath: string, aliasHint?: string): string | null {
  try {
    const raw = readFileSync('tsconfig.json', 'utf-8')
    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const tsconfig = JSON.parse(stripped)
    const paths: Record<string, string[]> = tsconfig?.compilerOptions?.paths ?? {}
    const normalizedOut = outPath.replace(/^\.\//, '').replace(/\.ts$/, '')

    for (const [pattern, targets] of Object.entries(paths)) {
      if (!pattern.endsWith('/*')) continue
      const aliasPrefix = pattern.slice(0, -2)
      if (aliasHint && aliasPrefix !== aliasHint) continue
      const target = (targets as string[])[0]
      if (!target?.endsWith('/*')) continue
      const targetPrefix = target.slice(0, -2).replace(/^\.\//, '')
      if (normalizedOut.startsWith(targetPrefix + '/')) {
        const rest = normalizedOut.slice(targetPrefix.length + 1)
        return `${aliasPrefix}/${rest}`
      }
    }
  } catch {
    // Could not read tsconfig
  }
  return null
}

const A = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
}

function promptText(
  label: string,
  defaultVal = '',
  validate?: (val: string) => string | null,
): Promise<string> {
  const hint = defaultVal ? ` [${defaultVal}]` : ''
  return new Promise(resolve => {
    function ask() {
      const rl = createInterface({ input: process.stdin, output: process.stderr })
      rl.question(`${label}${hint}: `, input => {
        rl.close()
        const value = input.trim() || defaultVal
        if (validate) {
          const err = validate(value)
          if (err) {
            process.stderr.write(`  ${A.dim}${err}${A.reset}\n`)
            ask()
            return
          }
        }
        resolve(value)
      })
    }
    ask()
  })
}

function promptEnter(message: string): Promise<void> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

function promptSelect(label: string, options: string[], defaultIdx = 0): Promise<string> {
  return new Promise(resolve => {
    let idx = defaultIdx
    const N = options.length
    const w = (s: string) => process.stderr.write(s)

    function render(initial: boolean) {
      if (!initial) w(`\x1b[${N}A`)
      options.forEach((opt, i) => {
        w('\x1b[2K\r')
        w(i === idx
          ? `  ${A.cyan}>${A.reset} ${A.bold}${opt}${A.reset}\n`
          : `    ${A.dim}${opt}${A.reset}\n`)
      })
    }

    w(`${label}\n`)
    render(true)

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    function onKey(key: string) {
      if (key === '\x03') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        w('\nCancelled.\n')
        process.exit(0)
      }
      if (key === '\x1b[A') { idx = (idx - 1 + N) % N; render(false) }
      if (key === '\x1b[B') { idx = (idx + 1) % N; render(false) }
      if (key === '\r') {
        process.stdin.removeListener('data', onKey)
        process.stdin.setRawMode(false)
        process.stdin.pause()
        w(`\x1b[${N + 1}A\x1b[0J`)
        w(`${label}: ${A.cyan}${options[idx]}${A.reset}\n`)
        resolve(options[idx])
      }
    }

    process.stdin.on('data', onKey)
  })
}

function validateContractAddress(val: string): string | null {
  if (!val) return 'Contract address is required'
  if (!/^C[A-Z2-7]{55}$/.test(val)) return 'Must be a 56-character Soroban address starting with C (uppercase, A-Z and 2-7 only)'
  return null
}

function validateContractName(val: string): string | null {
  if (!val) return null // Empty = use default
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(val)) return 'Must start with a letter and contain only letters and numbers (becomes a TypeScript interface name)'
  return null
}

async function promptNetwork(): Promise<{ networkArg?: string; rpcUrl?: string; passphrase?: string }> {
  const networkChoice = await promptSelect('Network', ['testnet', 'mainnet', 'futurenet', 'custom'])
  if (networkChoice === 'custom') {
    const rpcUrl = await promptText('RPC URL')
    const passphrase = await promptText('Network passphrase')
    return { rpcUrl, passphrase }
  }
  return { networkArg: networkChoice }
}

async function runInteractive(): Promise<void> {
  process.stderr.write(`\n`)
  process.stderr.write(`███████╗ ██████╗██╗  ██╗\n`)
  process.stderr.write(`██╔════╝██╔════╝██║ ██╔╝\n`)
  process.stderr.write(`███████╗██║     █████╔╝ \n`)
  process.stderr.write(`╚════██║██║     ██╔═██╗ \n`)
  process.stderr.write(`███████║╚██████╗██║  ██╗\n`)
  process.stderr.write(`╚══════╝ ╚═════╝╚═╝  ╚═╝\n`)
  process.stderr.write(`${A.dim}stellar-contracts-kit  •  Press Ctrl+C to cancel${A.reset}\n\n`)

  const command = await promptSelect('Command', ['generate', 'inspect'])

  if (command === 'inspect') {
    const contractId = await promptText('Contract address', '', validateContractAddress)
    const { networkArg, rpcUrl, passphrase } = await promptNetwork()
    const opts: InspectOptions = { contractId }
    if (networkArg) opts.networkArg = networkArg
    if (rpcUrl) opts.rpcUrl = rpcUrl
    if (passphrase) opts.passphrase = passphrase
    await runInspect(opts)
    return
  }

  const contractId = await promptText('Contract address', '', validateContractAddress)
  const rawNameInput = await promptText('Interface name', '', validateContractName)
  const rawName = rawNameInput || 'Contract'

  const langChoice = await promptSelect('Language', ['TypeScript', 'JavaScript'])
  const lang: 'ts' | 'js' = langChoice === 'JavaScript' ? 'js' : 'ts'
  const outRaw = `./contracts/${nameToKebab(rawName)}.${lang}`

  const { networkArg, rpcUrl, passphrase } = await promptNetwork()

  process.stderr.write(`\n${A.dim}`)
  process.stderr.write(`  Contract  : ${contractId}\n`)
  process.stderr.write(`  Network   : ${networkArg ?? 'custom'}\n`)
  process.stderr.write(`  Interface : ${rawName}\n`)
  process.stderr.write(`  Language  : ${langChoice}\n`)
  process.stderr.write(`  Output    : ${outRaw}\n`)
  process.stderr.write(A.reset)

  await promptEnter(`${A.dim}  Press Enter to generate, Ctrl+C to cancel${A.reset} `)

  const opts: GenerateOptions = { contractId, lang, rawOut: outRaw, rawName }
  if (networkArg) opts.networkArg = networkArg
  if (rpcUrl) opts.rpcUrl = rpcUrl
  if (passphrase) opts.passphrase = passphrase
  await runGenerate(opts)
}

interface GenerateOptions {
  contractId: string
  networkArg?: string
  rpcUrl?: string
  passphrase?: string
  rawOut?: string
  rawName?: string
  aliasHint?: string
  lang: 'ts' | 'js'
}

async function runGenerate(opts: GenerateOptions): Promise<void> {
  const { contractId, networkArg, rpcUrl, passphrase, rawName, aliasHint, lang } = opts

  const interfaceName = rawName ?? (opts.rawOut ? deriveInterfaceName(opts.rawOut) : 'Contract')
  const outPath = opts.rawOut ?? `./contracts/${nameToKebab(interfaceName)}.${lang}`

  if (!networkArg && !(rpcUrl && passphrase)) {
    process.stderr.write('Error: --network or (--rpc-url + --passphrase) is required\n')
    process.exit(1)
  }

  const network = rpcUrl && passphrase
    ? { rpcUrl, networkPassphrase: passphrase, horizonUrl: '' }
    : resolveNetwork(networkArg as 'testnet' | 'mainnet' | 'futurenet')

  const server = createServer(network)
  const networkLabel = networkArg ?? rpcUrl ?? 'custom'

  process.stderr.write(`\nFetching spec for ${contractId} on ${networkLabel}...\n`)

  let spec: contract.Spec
  try {
    spec = await fetchContractSpec(contractId, server, network)
  } catch (err) {
    if (isContractKitError(err)) {
      process.stderr.write(`Error [${err.code}]: ${err.message}\n`)
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    }
    process.exit(1)
  }

  process.stderr.write(`Generating types for interface "${interfaceName}"...\n`)

  const absOut = resolve(outPath)
  const dir = dirname(absOut)

  try {
    mkdirSync(dir, { recursive: true })
  } catch (err) {
    process.stderr.write(`Error: could not create directory "${dir}": ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }

  const ext = extname(absOut)
  const base = basename(absOut, ext)
  const exampleExt = lang === 'js' ? '.example.js' : '.example.ts'
  const examplePath = join(dir, `${base}${exampleExt}`)

  const aliasImport = detectAliasImport(outPath, aliasHint && aliasHint !== 'true' ? aliasHint : undefined)
  if (aliasImport) {
    process.stderr.write(`Using path alias: ${aliasImport}.js\n`)
  }

  const output = lang === 'js'
    ? generateOutputJs(spec, contractId, interfaceName, networkLabel)
    : generateOutput(spec, contractId, interfaceName, networkLabel)

  const example = lang === 'js'
    ? generateExampleJs(spec, contractId, interfaceName, base, networkLabel, outPath, aliasImport ?? undefined)
    : generateExample(spec, contractId, interfaceName, base, networkLabel, outPath, aliasImport ?? undefined)

  try {
    writeFileSync(absOut, output, 'utf-8')
    writeFileSync(examplePath, example, 'utf-8')
  } catch (err) {
    process.stderr.write(`Error: could not write output file: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }

  process.stderr.write(`${A.green}Done.${A.reset}\n  Types   -> ${absOut}\n  Example -> ${examplePath}\n`)
}

interface InspectOptions {
  contractId: string
  networkArg?: string
  rpcUrl?: string
  passphrase?: string
}

async function runInspect(opts: InspectOptions): Promise<void> {
  const { contractId, networkArg, rpcUrl, passphrase } = opts

  if (!networkArg && !(rpcUrl && passphrase)) {
    process.stderr.write('Error: --network or (--rpc-url + --passphrase) is required\n')
    process.exit(1)
  }

  const network = rpcUrl && passphrase
    ? { rpcUrl, networkPassphrase: passphrase, horizonUrl: '' }
    : resolveNetwork(networkArg as 'testnet' | 'mainnet' | 'futurenet')

  const server = createServer(network)
  const networkLabel = networkArg ?? rpcUrl ?? 'custom'

  process.stderr.write(`\nFetching spec for ${contractId} on ${networkLabel}...\n`)

  let spec: contract.Spec
  try {
    spec = await fetchContractSpec(contractId, server, network)
  } catch (err) {
    if (isContractKitError(err)) {
      process.stderr.write(`Error [${err.code}]: ${err.message}\n`)
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    }
    process.exit(1)
  }

  const entries: xdr.ScSpecEntry[] = (spec as any).entries
  const fns = spec.funcs()
  const w = (s: string) => process.stdout.write(s)
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

  w(`\n`)
  w(`${A.bold}Contract${A.reset} : ${contractId}\n`)
  w(`${A.bold}Network ${A.reset} : ${networkLabel}\n`)

  w(`\n${A.bold}${A.cyan}Functions (${fns.length})${A.reset}\n`)
  for (const fn of fns) {
    try {
      const name = fn.name().toString()
      const inputs: any[] = fn.inputs()
      const outputs: xdr.ScSpecTypeDef[] = fn.outputs()
      const retType = outputs.length === 0
        ? 'void'
        : outputs.length === 1 ? toTs(outputs[0])
        : `[${outputs.map(toTs).join(', ')}]`
      const params = inputs.map((i: any) => `${i.name().toString()}: ${toTs(i.type())}`).join(', ')
      w(`  ${A.green}${name}${A.reset}(${A.dim}${params}${A.reset}) ${A.dim}->${A.reset} ${retType}\n`)
    } catch {}
  }

  const typeEntries = entries.filter(e => {
    const k = e.switch().name as string
    return k === 'scSpecEntryUdtStructV0'
      || k === 'scSpecEntryUdtEnumV0'
      || k === 'scSpecEntryUdtErrorEnumV0'
      || k === 'scSpecEntryUdtUnionV0'
  })

  if (typeEntries.length > 0) {
    w(`\n${A.bold}${A.cyan}Custom Types (${typeEntries.length})${A.reset}\n`)
    for (const entry of typeEntries) {
      try {
        const kind = entry.switch().name as string

        if (kind === 'scSpecEntryUdtStructV0') {
          const s = (entry as any).udtStructV0()
          const fields: any[] = s.fields()
          const name: string = s.name().toString()
          const isTuple = fields.length > 0 && fields.every((f: any) => /^\d+$/.test(f.name().toString()))
          if (isTuple) {
            const types = fields.map((f: any) => toTs(f.type())).join(', ')
            w(`  ${A.dim}${pad('type', 6)}${A.reset} ${A.bold}${name}${A.reset} = [${types}]\n`)
          } else {
            const fieldStr = fields.map((f: any) => `${f.name().toString()}: ${toTs(f.type())}`).join(', ')
            w(`  ${A.dim}${pad('struct', 6)}${A.reset} ${A.bold}${name}${A.reset} { ${fieldStr} }\n`)
          }
        }

        if (kind === 'scSpecEntryUdtEnumV0' || kind === 'scSpecEntryUdtErrorEnumV0') {
          const isErr = kind === 'scSpecEntryUdtErrorEnumV0'
          const e = isErr ? (entry as any).udtErrorEnumV0() : (entry as any).udtEnumV0()
          const name: string = e.name().toString()
          const cases: string = e.cases().map((c: any) => `${c.name().toString()} = ${c.value()}`).join(', ')
          w(`  ${A.dim}${pad(isErr ? 'error' : 'enum', 6)}${A.reset} ${A.bold}${name}${A.reset} { ${cases} }\n`)
        }

        if (kind === 'scSpecEntryUdtUnionV0') {
          const u = (entry as any).udtUnionV0()
          const name: string = u.name().toString()
          const variants: string = u.cases().map((c: any) => {
            const isVoid = c.switch().name === 'scSpecUdtUnionCaseVoidV0'
            const inner = isVoid ? c.voidV0() : c.tupleV0()
            const tag: string = inner.name().toString()
            if (isVoid) return `'${tag}'`
            const types: string[] = inner.type().map(toTs)
            return types.length === 1 ? `'${tag}'(${types[0]})` : `'${tag}'(${types.join(', ')})`
          }).join(' | ')
          w(`  ${A.dim}${pad('union', 6)}${A.reset} ${A.bold}${name}${A.reset} ${variants}\n`)
        }
      } catch {}
    }
  }

  w(`\n`)
}

function printHelp() {
  process.stdout.write(`
${A.bold}sck${A.reset} (stellar-contracts-kit): TypeScript SDK for Soroban smart contracts

Commands:
  generate    Generate TypeScript types and example file for a contract
  inspect     Print contract functions and custom types to the terminal

Usage:
  npx sck                         Interactive mode with arrow-key selection
  npx sck generate [options]       Generate types (non-interactive)
  npx sck inspect  [options]       Inspect a contract (non-interactive)
  npx sck [options]                Shorthand for generate (backwards-compatible)

Options (generate + inspect):
  --contract    Contract address (C..., 56 chars)
  --network     testnet | mainnet | futurenet
  --rpc-url     Custom RPC URL (use with --passphrase instead of --network)
  --passphrase  Custom network passphrase

Options (generate only):
  --out         Output file path  (default: ./contracts/<name>.ts)
  --name        Interface name    (default: derived from --out filename)
  --alias       Path alias prefix, e.g. @  (auto-detected from tsconfig.json)
  --js          Generate JavaScript output instead of TypeScript
  --help, -h    Show this help

Examples:
  npx sck
  npx sck generate --contract CABC... --network testnet
  npx sck inspect  --contract CABC... --network testnet
  npx sck generate --contract CABC... --network testnet --out src/contracts/counter.ts
`)
}

async function main() {
  const rawArgs = process.argv.slice(2)

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  // Detect optional subcommand (first positional arg not starting with --)
  const subcommand = rawArgs[0] && !rawArgs[0].startsWith('--') ? rawArgs[0] : undefined
  const flagArgs = subcommand ? rawArgs.slice(1) : rawArgs

  const args: Record<string, string> = {}
  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i].startsWith('--')) {
      const key = flagArgs[i].slice(2)
      const next = flagArgs[i + 1]
      args[key] = next && !next.startsWith('--') ? (i++, next) : 'true'
    }
  }

  const contractId = args['contract'] ?? args['contract-id']

  if (subcommand === 'inspect') {
    if (!contractId) {
      process.stderr.write('Error: --contract is required\n')
      process.stderr.write('Usage: npx sck inspect --contract <ID> --network <preset>\n')
      process.stderr.write('       npx sck (interactive mode)\n')
      process.exit(1)
    }
    await runInspect({
      contractId,
      networkArg: args['network'],
      rpcUrl: args['rpc-url'],
      passphrase: args['passphrase'],
    })
    return
  }

  if (subcommand && subcommand !== 'generate') {
    process.stderr.write(`Error: unknown command '${subcommand}'\n`)
    process.stderr.write('Run npx sck --help for usage.\n')
    process.exit(1)
  }

  if (!contractId) {
    if (!process.stdin.isTTY) {
      process.stderr.write('Error: --contract is required (interactive mode needs a terminal)\n')
      process.stderr.write('Usage: npx sck --contract <ID> --network <preset>\n')
      process.exit(1)
    }
    await runInteractive()
    return
  }

  await runGenerate({
    contractId,
    networkArg: args['network'],
    rpcUrl: args['rpc-url'],
    passphrase: args['passphrase'],
    rawOut: args['out'] ?? args['output'],
    rawName: args['name'],
    aliasHint: args['alias'],
    lang: args['js'] === 'true' ? 'js' : 'ts',
  })
}

main().catch(err => {
  process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
