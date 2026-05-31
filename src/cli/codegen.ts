import { xdr, contract } from '@stellar/stellar-sdk'


function placeholder(typeDef: xdr.ScSpecTypeDef, lang: 'ts' | 'js' = 'ts'): string {
  const name = typeDef.switch().name as string
  switch (name) {
    case 'scSpecTypeBool':    return 'false'
    case 'scSpecTypeVoid':    return 'undefined'
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':     return '0'
    case 'scSpecTypeU64':
    case 'scSpecTypeI64':
    case 'scSpecTypeU128':
    case 'scSpecTypeI128':
    case 'scSpecTypeU256':
    case 'scSpecTypeI256':
    case 'scSpecTypeTimepoint':
    case 'scSpecTypeDuration': return '0n'
    case 'scSpecTypeString':
    case 'scSpecTypeSymbol':  return "''"
    case 'scSpecTypeAddress':
    case 'scSpecTypeMuxedAddress': return "'G...'"
    case 'scSpecTypeBytes':
    case 'scSpecTypeBytesN':  return 'new Uint8Array()'
    case 'scSpecTypeOption':  return 'null'
    case 'scSpecTypeVec':     return '[]'
    case 'scSpecTypeMap':     return 'new Map()'
    case 'scSpecTypeTuple': {
      const types: xdr.ScSpecTypeDef[] = (typeDef as any).tuple().valueTypes()
      return `[${types.map(t => placeholder(t, lang)).join(', ')}]`
    }
    case 'scSpecTypeUdt': {
      const udtName = (typeDef as any).udt().name().toString()
      return lang === 'ts' ? `{} as unknown as ${udtName}` : '{}'
    }
    default: return 'undefined'
  }
}

export function toTs(typeDef: xdr.ScSpecTypeDef): string {
  const name = typeDef.switch().name as string
  switch (name) {
    case 'scSpecTypeBool':         return 'boolean'
    case 'scSpecTypeVoid':         return 'void'
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':          return 'number'
    case 'scSpecTypeU64':
    case 'scSpecTypeI64':
    case 'scSpecTypeU128':
    case 'scSpecTypeI128':
    case 'scSpecTypeU256':
    case 'scSpecTypeI256':
    case 'scSpecTypeTimepoint':
    case 'scSpecTypeDuration':     return 'bigint'
    case 'scSpecTypeString':
    case 'scSpecTypeSymbol':       return 'string'
    case 'scSpecTypeAddress':
    case 'scSpecTypeMuxedAddress': return 'string'
    case 'scSpecTypeBytes':
    case 'scSpecTypeBytesN':       return 'Uint8Array'
    case 'scSpecTypeOption': {
      const inner = toTs((typeDef as any).option().valueType())
      return `${inner} | null`
    }
    case 'scSpecTypeResult': {
      return toTs((typeDef as any).result().okType())
    }
    case 'scSpecTypeVec': {
      const inner = toTs((typeDef as any).vec().elementType())
      return `Array<${inner}>`
    }
    case 'scSpecTypeMap': {
      const k = toTs((typeDef as any).map().keyType())
      const v = toTs((typeDef as any).map().valueType())
      return `Map<${k}, ${v}>`
    }
    case 'scSpecTypeTuple': {
      const types: string[] = (typeDef as any).tuple().valueTypes().map(toTs)
      return `[${types.join(', ')}]`
    }
    case 'scSpecTypeUdt': {
      return (typeDef as any).udt().name().toString()
    }
    default: return 'unknown'
  }
}

export function generateCustomTypes(entries: xdr.ScSpecEntry[]): string {
  const out: string[] = []

  for (const entry of entries) {
    const kind = entry.switch().name as string

    try {
    if (kind === 'scSpecEntryUdtStructV0') {
      const s = (entry as any).udtStructV0()
      const fields: any[] = s.fields()
      const isTuple = fields.length > 0 && fields.every((f: any) => /^\d+$/.test(f.name().toString()))
      if (isTuple) {
        const types = fields.map((f: any) => toTs(f.type()))
        out.push(`export type ${s.name().toString()} = [${types.join(', ')}]`)
      } else {
        out.push(`export interface ${s.name().toString()} {`)
        for (const f of fields) {
          out.push(`  ${f.name().toString()}: ${toTs(f.type())}`)
        }
        out.push('}')
      }
      out.push('')
    }

    if (kind === 'scSpecEntryUdtEnumV0' || kind === 'scSpecEntryUdtErrorEnumV0') {
      const e = kind === 'scSpecEntryUdtEnumV0'
        ? (entry as any).udtEnumV0()
        : (entry as any).udtErrorEnumV0()
      out.push(`export enum ${e.name().toString()} {`)
      for (const c of e.cases()) {
        out.push(`  ${c.name().toString()} = ${c.value()},`)
      }
      out.push('}')
      out.push('')
    }

    if (kind === 'scSpecEntryUdtUnionV0') {
      const u = (entry as any).udtUnionV0()
      const caseTypes: string[] = u.cases().map((c: any) => {
        const isVoid = c.switch().name === 'scSpecUdtUnionCaseVoidV0'
        // ScSpecUdtUnionCaseV0 is a wrapper. Name lives on the inner type
        const inner = isVoid ? c.voidV0() : c.tupleV0()
        const tag = inner.name().toString()
        if (isVoid) return `{ tag: '${tag}' }`
        const types: string[] = inner.type().map(toTs)
        return types.length === 1
          ? `{ tag: '${tag}'; value: ${types[0]} }`
          : `{ tag: '${tag}'; value: [${types.join(', ')}] }`
      })
      out.push(`export type ${u.name().toString()} =`)
      out.push(caseTypes.map((t: string) => `  | ${t}`).join('\n'))
      out.push('')
    }
    } catch {
      // Skip entries that cannot be parsed. Future spec additions should not break generation.
    }
  }

  return out.join('\n')
}

export function generateInterface(spec: contract.Spec, interfaceName: string): string {
  const out: string[] = []
  out.push(`export interface ${interfaceName} {`)

  for (const fn of spec.funcs()) {
    try {
      const methodName: string = fn.name().toString()
      const inputs: any[] = fn.inputs()
      const outputs: xdr.ScSpecTypeDef[] = fn.outputs()

      const returnType = outputs.length === 0
        ? 'void'
        : outputs.length === 1
          ? toTs(outputs[0])
          : `[${outputs.map(toTs).join(', ')}]`

      // Labeled tuple gives parameter names in VSCode hover tooltips.
      const argParts = inputs.map((i: any) => `${i.name().toString()}: ${toTs(i.type())}`)
      const argsTuple = `[${argParts.join(', ')}]`

      out.push(`  ${methodName}: ContractMethodFn<${returnType}, ${argsTuple}>`)
    } catch {
      // Skip functions that cannot be parsed
    }
  }

  out.push('}')
  return out.join('\n')
}

export function generateExample(
  spec: contract.Spec,
  contractId: string,
  interfaceName: string,
  importBasename: string,
  networkLabel: string,
  typesRelPath?: string,
  aliasImport?: string,
): string {
  const isPreset = ['testnet', 'mainnet', 'futurenet'].includes(networkLabel)
  const networkInit = isPreset
    ? `{ network: '${networkLabel}' }`
    : `{ network: { rpcUrl: 'https://...', networkPassphrase: '...', horizonUrl: 'https://...' } }`

  // If an alias is available, use it directly. Otherwise fall back to relative import with a hint.
  const importPath = aliasImport ? `${aliasImport}.js` : `./${importBasename}.js`
  const importComment = !aliasImport
    ? (typesRelPath
        ? `// Types file: ${typesRelPath}. Update the path below if using snippets elsewhere.`
        : `// Update the import path below to match your file's location relative to the types file.`)
    : null

  const referencedUdts = new Set<string>()
  for (const fn of spec.funcs()) {
    try {
      for (const i of fn.inputs() as any[]) {
        if (i.type().switch().name === 'scSpecTypeUdt') {
          referencedUdts.add((i.type() as any).udt().name().toString())
        }
      }
    } catch {}
  }

  const typeImports = [interfaceName, ...Array.from(referencedUdts).sort()].join(', ')

  const lines: string[] = [
    `// Auto-generated by stellar-contracts-kit`,
    `// Example usage for ${interfaceName}`,
    `// Contract : ${contractId}`,
    `// Network  : ${networkLabel}`,
    `// Adapt this file to your project. Re-run \`npx sck generate\` to refresh after a contract upgrade.`,
    ``,
    `import { StellarContractsKit } from 'stellar-contracts-kit'`,
    ...(importComment ? [importComment] : []),
    `import type { ${typeImports} } from '${importPath}'`,
    `import { CONTRACT_ID } from '${importPath}'`,
    ``,
    `const kit = new StellarContractsKit(${networkInit})`,
    ``,
    `// Connect wallet (opens picker modal if no wallet specified)`,
    `const { address } = await kit.connect()`,
    `console.log('Connected:', address)`,
    ``,
    `// Load the typed contract client`,
    `const contract = await kit.contract<${interfaceName}>(CONTRACT_ID)`,
    ``,
  ]

  for (const fn of spec.funcs()) {
    const methodName: string = fn.name().toString()
    const inputs: any[] = fn.inputs()
    const outputs: xdr.ScSpecTypeDef[] = fn.outputs()

    const isVoid = outputs.length === 0
    const hasParams = inputs.length > 0
    const returnType = isVoid
      ? 'void'
      : outputs.length === 1 ? toTs(outputs[0]) : `[${outputs.map(toTs).join(', ')}]`

    const sig = `${methodName}(${inputs.map((i: any) => `${i.name().toString()}: ${toTs(i.type())}`).join(', ')}) -> ${returnType}`
    lines.push(`// ${sig}`)

    const argLines = inputs.map((i: any) => {
      const val = placeholder(i.type(), 'ts')
      return `  ${val},  // ${i.name().toString()}: ${toTs(i.type())}`
    })

    // Heuristic: no params + has return = read-only getter, everything else = invoke
    const isLikelyRead = !hasParams && !isVoid

    if (isLikelyRead) {
      lines.push(`const { result: ${methodName}Result } = await contract.${methodName}.read()`)
      lines.push(`console.log('${methodName}:', ${methodName}Result)`)
    } else if (isVoid && !hasParams) {
      lines.push(`const { txHash: ${methodName}TxHash } = await contract.${methodName}.invoke()`)
      lines.push(`console.log('${methodName} txHash:', ${methodName}TxHash)`)
    } else if (isVoid) {
      lines.push(`const { txHash: ${methodName}TxHash } = await contract.${methodName}.invoke(`)
      lines.push(...argLines)
      lines.push(`)`)
      lines.push(`console.log('${methodName} txHash:', ${methodName}TxHash)`)
    } else {
      lines.push(`const { txHash: ${methodName}TxHash, result: ${methodName}Result } = await contract.${methodName}.invoke(`)
      lines.push(...argLines)
      lines.push(`)`)
      lines.push(`console.log('${methodName} txHash:', ${methodName}TxHash, 'result:', ${methodName}Result)`)
    }

    lines.push(``)
  }

  return lines.join('\n')
}

function generateCustomTypesJs(entries: xdr.ScSpecEntry[]): string {
  const out: string[] = []

  for (const entry of entries) {
    const kind = entry.switch().name as string
    try {
      if (kind === 'scSpecEntryUdtStructV0') {
        const s = (entry as any).udtStructV0()
        const fields: any[] = s.fields()
        const isTuple = fields.length > 0 && fields.every((f: any) => /^\d+$/.test(f.name().toString()))
        if (isTuple) {
          const types = fields.map((f: any) => toTs(f.type())).join(', ')
          out.push(`/** @typedef {[${types}]} ${s.name().toString()} */`)
        } else {
          const fieldStr = fields.map((f: any) => `${f.name().toString()}: ${toTs(f.type())}`).join(', ')
          out.push(`/** @typedef {{ ${fieldStr} }} ${s.name().toString()} */`)
        }
        out.push('')
      }

      if (kind === 'scSpecEntryUdtEnumV0' || kind === 'scSpecEntryUdtErrorEnumV0') {
        const e = kind === 'scSpecEntryUdtEnumV0'
          ? (entry as any).udtEnumV0()
          : (entry as any).udtErrorEnumV0()
        out.push(`export const ${e.name().toString()} = Object.freeze({`)
        for (const c of e.cases()) {
          out.push(`  ${c.name().toString()}: ${c.value()},`)
        }
        out.push(`})`)
        out.push('')
      }

      if (kind === 'scSpecEntryUdtUnionV0') {
        const u = (entry as any).udtUnionV0()
        const caseTypes = u.cases().map((c: any) => {
          const isVoid = c.switch().name === 'scSpecUdtUnionCaseVoidV0'
          const inner = isVoid ? c.voidV0() : c.tupleV0()
          const tag = inner.name().toString()
          if (isVoid) return `{ tag: '${tag}' }`
          const types: string[] = inner.type().map(toTs)
          return types.length === 1
            ? `{ tag: '${tag}', value: ${types[0]} }`
            : `{ tag: '${tag}', value: [${types.join(', ')}] }`
        })
        out.push(`/** @typedef {${caseTypes.join(' | ')}} ${u.name().toString()} */`)
        out.push('')
      }
    } catch {}
  }

  return out.join('\n')
}

function generateInterfaceJs(spec: contract.Spec, interfaceName: string): string {
  const lines: string[] = ['/**', ` * @typedef {Object} ${interfaceName}`]

  for (const fn of spec.funcs()) {
    try {
      const methodName = fn.name().toString()
      const inputs: any[] = fn.inputs()
      const outputs: xdr.ScSpecTypeDef[] = fn.outputs()

      const returnType = outputs.length === 0
        ? 'void'
        : outputs.length === 1 ? toTs(outputs[0]) : `[${outputs.map(toTs).join(', ')}]`

      const argParts = inputs.map((i: any) => `${i.name().toString()}: ${toTs(i.type())}`)
      const argsTuple = `[${argParts.join(', ')}]`

      lines.push(` * @property {import('stellar-contracts-kit').ContractMethodFn<${returnType}, ${argsTuple}>} ${methodName}`)
    } catch {}
  }

  lines.push(' */')
  return lines.join('\n')
}

export function generateOutputJs(
  spec: contract.Spec,
  contractId: string,
  interfaceName: string,
  networkLabel: string,
): string {
  const entries: xdr.ScSpecEntry[] = (spec as any).entries
  const customTypes = generateCustomTypesJs(entries).trim()
  const iface = generateInterfaceJs(spec, interfaceName)

  const lines: string[] = [
    `// Auto-generated by stellar-contracts-kit`,
    `// Contract : ${contractId}`,
    `// Network  : ${networkLabel}`,
    `// Re-run \`npx sck generate\` to update after a contract upgrade.`,
    ``,
  ]

  if (customTypes) {
    lines.push(`// Custom Types`)
    lines.push(``)
    lines.push(customTypes)
    lines.push(``)
  }

  lines.push(`// Contract Interface`)
  lines.push(``)
  lines.push(iface)
  lines.push(``)
  lines.push(`export const CONTRACT_ID = '${contractId}'`)
  lines.push(``)

  return lines.join('\n')
}

export function generateExampleJs(
  spec: contract.Spec,
  contractId: string,
  interfaceName: string,
  importBasename: string,
  networkLabel: string,
  typesRelPath?: string,
  aliasImport?: string,
): string {
  const isPreset = ['testnet', 'mainnet', 'futurenet'].includes(networkLabel)
  const networkInit = isPreset
    ? `{ network: '${networkLabel}' }`
    : `{ network: { rpcUrl: 'https://...', networkPassphrase: '...', horizonUrl: 'https://...' } }`

  const importPath = aliasImport ? `${aliasImport}.js` : `./${importBasename}.js`
  const importComment = !aliasImport
    ? (typesRelPath
        ? `// Types file: ${typesRelPath}. Update the path below if using snippets elsewhere.`
        : `// Update the import path below to match your file's location relative to the types file.`)
    : null

  const lines: string[] = [
    `// Auto-generated by stellar-contracts-kit`,
    `// Example usage for ${interfaceName}`,
    `// Contract : ${contractId}`,
    `// Network  : ${networkLabel}`,
    `// @ts-check`,
    ``,
    `import { StellarContractsKit } from 'stellar-contracts-kit'`,
    ...(importComment ? [importComment] : []),
    `import { CONTRACT_ID } from '${importPath}'`,
    ``,
    `const kit = new StellarContractsKit(${networkInit})`,
    ``,
    `// Connect wallet (opens picker modal if no wallet specified)`,
    `const { address } = await kit.connect()`,
    `console.log('Connected:', address)`,
    ``,
    `// Load the contract client`,
    `const contract = await kit.contract(CONTRACT_ID)`,
    ``,
  ]

  for (const fn of spec.funcs()) {
    const methodName: string = fn.name().toString()
    const inputs: any[] = fn.inputs()
    const outputs: xdr.ScSpecTypeDef[] = fn.outputs()

    const isVoid = outputs.length === 0
    const hasParams = inputs.length > 0
    const returnType = isVoid ? 'void' : outputs.length === 1 ? toTs(outputs[0]) : `[${outputs.map(toTs).join(', ')}]`

    lines.push(`// ${methodName}(${inputs.map((i: any) => `${i.name().toString()}: ${toTs(i.type())}`).join(', ')}) -> ${returnType}`)

    const argLines = inputs.map((i: any) => `  ${placeholder(i.type(), 'js')},  // ${i.name().toString()}: ${toTs(i.type())}`)
    const isLikelyRead = !hasParams && !isVoid

    if (isLikelyRead) {
      lines.push(`const { result: ${methodName}Result } = await contract.${methodName}.read()`)
      lines.push(`console.log('${methodName}:', ${methodName}Result)`)
    } else if (isVoid && !hasParams) {
      lines.push(`const { txHash: ${methodName}TxHash } = await contract.${methodName}.invoke()`)
      lines.push(`console.log('${methodName} txHash:', ${methodName}TxHash)`)
    } else if (isVoid) {
      lines.push(`const { txHash: ${methodName}TxHash } = await contract.${methodName}.invoke(`)
      lines.push(...argLines)
      lines.push(`)`)
      lines.push(`console.log('${methodName} txHash:', ${methodName}TxHash)`)
    } else {
      lines.push(`const { txHash: ${methodName}TxHash, result: ${methodName}Result } = await contract.${methodName}.invoke(`)
      lines.push(...argLines)
      lines.push(`)`)
      lines.push(`console.log('${methodName} txHash:', ${methodName}TxHash, 'result:', ${methodName}Result)`)
    }

    lines.push(``)
  }

  return lines.join('\n')
}

export function generateOutput(
  spec: contract.Spec,
  contractId: string,
  interfaceName: string,
  networkLabel: string,
): string {
  const entries: xdr.ScSpecEntry[] = (spec as any).entries
  const customTypes = generateCustomTypes(entries).trim()
  const iface = generateInterface(spec, interfaceName)

  const lines: string[] = [
    `// Auto-generated by stellar-contracts-kit`,
    `// Contract : ${contractId}`,
    `// Network  : ${networkLabel}`,
    `// Re-run \`npx sck generate\` to update after a contract upgrade.`,
    ``,
    `import type { ContractMethodFn } from 'stellar-contracts-kit'`,
    ``,
  ]

  if (customTypes) {
    lines.push(`// Custom Types`)
    lines.push(``)
    lines.push(customTypes)
    lines.push(``)
  }

  lines.push(`// Contract Interface`)
  lines.push(``)
  lines.push(iface)
  lines.push(``)
  lines.push(`export const CONTRACT_ID = '${contractId}' as const`)
  lines.push(``)

  return lines.join('\n')
}
