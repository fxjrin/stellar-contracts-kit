import type { WalletAdapter } from './types.js'
import { FreighterAdapter } from './freighter.js'
import { LobstrAdapter } from './lobstr.js'
import { CyphrasAdapter } from './cyphras.js'
import { isContractKitError } from '../errors/index.js'
import { FREIGHTER_ICON, LOBSTR_ICON, CYPHRAS_ICON } from './icons.js'

export interface PickResult {
  adapter: WalletAdapter
  address: string
}

interface WalletDef {
  id: string
  name: string
  description: string
  createAdapter: () => WalletAdapter
  installUrl: string
  icon: string
}

const WALLETS: WalletDef[] = [
  {
    id: 'freighter',
    name: 'Freighter',
    description: 'Stellar Development Foundation',
    createAdapter: () => new FreighterAdapter(),
    installUrl: 'https://freighter.app',
    icon: FREIGHTER_ICON,
  },
  {
    id: 'cyphras',
    name: 'Cyphras',
    description: 'Cyphras Wallet',
    createAdapter: () => new CyphrasAdapter(),
    installUrl: 'https://cyphras.com',
    icon: CYPHRAS_ICON,
  },
  {
    id: 'lobstr',
    name: 'Lobstr',
    description: 'LOBSTR',
    createAdapter: () => new LobstrAdapter(),
    installUrl: 'https://lobstr.co/',
    icon: LOBSTR_ICON,
  },
]

const STYLE_ID = '__stellar_contracts_kit_styles__'

const CSS = `
  @keyframes _sck_fade{from{opacity:0}to{opacity:1}}
  @keyframes _sck_up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes _sck_spin{to{transform:rotate(360deg)}}
  ._sck_overlay{
    position:fixed;inset:0;z-index:2147483647;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.48);backdrop-filter:blur(8px);
    animation:_sck_fade .15s ease;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  }

  ._sck_card{
    background:#fff;border-radius:24px;width:min(380px,92vw);
    box-shadow:0 24px 64px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.06);
    animation:_sck_up .2s cubic-bezier(.16,1,.3,1);
    overflow:hidden;
  }

  ._sck_head{
    display:flex;align-items:center;justify-content:space-between;
    padding:20px 20px 0;
  }

  ._sck_title{font-size:16px;font-weight:700;color:#111;letter-spacing:-.3px}

  ._sck_close{
    width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;
    background:#f0f0f0;color:#777;padding:0;
    display:flex;align-items:center;justify-content:center;
    transition:background .12s,color .12s;flex-shrink:0;
  }
  ._sck_close:hover{background:#e3e3e3;color:#111}
  ._sck_close svg{display:block}

  ._sck_list{padding:12px 8px 10px;display:flex;flex-direction:column;gap:2px}

  ._sck_item{
    display:flex;align-items:center;gap:12px;
    padding:10px 12px;border-radius:14px;
    cursor:pointer;transition:background .1s;
    background:transparent;width:100%;text-align:left;
    border:none;outline:none;
  }
  ._sck_item:hover{background:#f5f5f5}
  ._sck_item:focus-visible{outline:2px solid #3b82f6;outline-offset:1px}
  ._sck_item._sck_connecting{pointer-events:none}
  ._sck_item._sck_error{background:#fef2f2}

  ._sck_icon{
    width:44px;height:44px;border-radius:12px;overflow:hidden;
    flex-shrink:0;background:#f5f5f5;
  }
  ._sck_icon img,._sck_icon svg{width:100%;height:100%;display:block}

  ._sck_meta{flex:1;min-width:0}
  ._sck_name{font-size:15px;font-weight:600;color:#111;line-height:1.3}
  ._sck_sub{font-size:12px;color:#aaa;margin-top:1px}
  ._sck_errmsg{font-size:11px;color:#dc2626;margin-top:3px;line-height:1.4}

  ._sck_right{
    width:80px;display:flex;align-items:center;
    justify-content:flex-end;flex-shrink:0;
  }

  ._sck_install{
    display:inline-flex;align-items:center;gap:5px;
    font-size:12px;font-weight:500;color:#aaa;
    text-decoration:none;transition:color .12s;white-space:nowrap;
  }
  ._sck_install:hover{color:#555}
  ._sck_install svg{display:block;flex-shrink:0}

  ._sck_spinner{
    width:18px;height:18px;border-radius:50%;
    border:2.5px solid #e0e0e0;border-top-color:#444;
    animation:_sck_spin .7s linear infinite;
  }

  ._sck_foot{
    padding:10px 20px 16px;text-align:center;
    font-size:11px;color:#d0d0d0;border-top:1px solid #f2f2f2;margin-top:4px;
    letter-spacing:.2px;
  }
`

function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

type AvailState = 'checking' | 'yes' | 'no'

interface ItemUI {
  el: HTMLButtonElement
  setAvail(state: AvailState): void
  setConnecting(loading: boolean, errorMsg?: string): void
}

function buildItem(def: WalletDef, onConnect: (def: WalletDef) => void): ItemUI {
  const el = document.createElement('button')
  el.className = '_sck_item'
  el.type = 'button'

  const iconWrap = document.createElement('div')
  iconWrap.className = '_sck_icon'
  iconWrap.innerHTML = def.icon

  const meta = document.createElement('div')
  meta.className = '_sck_meta'

  const name = document.createElement('div')
  name.className = '_sck_name'
  name.textContent = def.name

  const sub = document.createElement('div')
  sub.className = '_sck_sub'
  sub.textContent = def.description

  const errEl = document.createElement('div')
  errEl.className = '_sck_errmsg'
  errEl.style.display = 'none'

  meta.append(name, sub, errEl)

  const right = document.createElement('div')
  right.className = '_sck_right'

  // Right starts empty while availability is checked

  el.append(iconWrap, meta, right)

  let avail: AvailState = 'checking'

  el.addEventListener('click', () => {
    if (avail === 'checking') return
    if (avail === 'no') {
      window.open(def.installUrl, '_blank', 'noopener,noreferrer')
      return
    }
    onConnect(def)
  })

  function renderRight() {
    right.innerHTML = ''
    errEl.style.display = 'none'

    if (avail === 'checking') {
      // Nothing shown while checking
    } else if (avail === 'yes') {
      // Intentionally empty. Hover on the row is enough affordance
    } else {
      const link = document.createElement('a')
      link.className = '_sck_install'
      link.href = def.installUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.innerHTML = 'Install<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>'
      link.addEventListener('click', e => e.stopPropagation())
      right.appendChild(link)
    }
  }

  function setAvail(state: AvailState) {
    avail = state
    el.classList.remove('_sck_connecting', '_sck_error')
    renderRight()
  }

  function setConnecting(loading: boolean, errorMsg?: string) {
    if (loading) {
      el.classList.add('_sck_connecting')
      el.classList.remove('_sck_error')
      right.innerHTML = ''
      const spinner = document.createElement('div')
      spinner.className = '_sck_spinner'
      right.appendChild(spinner)
      errEl.style.display = 'none'
    } else if (errorMsg !== undefined) {
      el.classList.remove('_sck_connecting')
      el.classList.add('_sck_error')
      errEl.textContent = errorMsg
      errEl.style.display = 'block'
      renderRight()
    } else {
      el.classList.remove('_sck_connecting', '_sck_error')
      renderRight()
    }
  }

  return { el, setAvail, setConnecting }
}

export class WalletPickerModal {
  private overlay: HTMLDivElement | null = null
  private onKeydown: ((e: KeyboardEvent) => void) | null = null

  async pick(): Promise<PickResult> {
    if (typeof document === 'undefined') {
      throw new Error('WalletPickerModal requires a browser environment.')
    }
    injectStyles()

    return new Promise<PickResult>((resolve, reject) => {
      const itemUIs = this.render(resolve, reject)

      for (const def of WALLETS) {
        const ui = itemUIs.get(def.id)!
        Promise.resolve(def.createAdapter().isAvailable())
          .then(ok => ui.setAvail(ok ? 'yes' : 'no'))
          .catch(() => ui.setAvail('no'))
      }
    })
  }

  private render(
    resolve: (r: PickResult) => void,
    reject: (err: unknown) => void,
  ): Map<string, ItemUI> {
    const overlay = document.createElement('div')
    overlay.className = '_sck_overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Connect Wallet')
    this.overlay = overlay

    const card = document.createElement('div')
    card.className = '_sck_card'
    card.addEventListener('click', e => e.stopPropagation())

    const head = document.createElement('div')
    head.className = '_sck_head'

    const title = document.createElement('div')
    title.className = '_sck_title'
    title.textContent = 'Connect Wallet'

    const closeBtn = document.createElement('button')
    closeBtn.className = '_sck_close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
    closeBtn.addEventListener('click', () => this.dismiss(reject))

    head.append(title, closeBtn)

    const list = document.createElement('div')
    list.className = '_sck_list'

    const itemUIs = new Map<string, ItemUI>()

    for (const def of WALLETS) {
      const item = buildItem(def, async (clickedDef) => {
        const ui = itemUIs.get(clickedDef.id)!

        itemUIs.forEach((other, id) => {
          if (id !== clickedDef.id) {
            other.el.style.opacity = '0.3'
            other.el.style.pointerEvents = 'none'
          }
        })

        ui.setConnecting(true)

        try {
          const adapter = clickedDef.createAdapter()
          const { address } = await adapter.connect()
          this.close()
          resolve({ adapter, address })
        } catch (err) {
          itemUIs.forEach(other => {
            other.el.style.opacity = ''
            other.el.style.pointerEvents = ''
          })

          let msg = 'Connection failed. Try again.'
          if (isContractKitError(err)) {
            msg = err.code === 'WALLET_REJECTED' ? 'Connection rejected.' : err.message
          } else if (err instanceof Error) {
            msg = err.message
          }
          ui.setConnecting(false, msg)
        }
      })

      itemUIs.set(def.id, item)
      list.appendChild(item.el)
    }

    const foot = document.createElement('div')
    foot.className = '_sck_foot'
    foot.textContent = 'stellar-contracts-kit'

    card.append(head, list, foot)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    overlay.addEventListener('click', () => this.dismiss(reject))

    this.onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.dismiss(reject)
    }
    document.addEventListener('keydown', this.onKeydown)

    list.querySelector<HTMLButtonElement>('._sck_item')?.focus()

    return itemUIs
  }

  private close() {
    this.overlay?.remove()
    this.overlay = null
    if (this.onKeydown) {
      document.removeEventListener('keydown', this.onKeydown)
      this.onKeydown = null
    }
  }

  private dismiss(reject: (err: unknown) => void) {
    this.close()
    reject(new Error('Wallet selection was dismissed'))
  }
}
