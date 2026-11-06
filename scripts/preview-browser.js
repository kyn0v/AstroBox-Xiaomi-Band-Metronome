;(function (host) {
  const EVENTS = new Set(['onclick', 'onlongpress', 'ontouchstart', 'ontouchmove', 'ontouchend', 'onchange'])
  const ATTRIBUTES = {
    div: ['class', 'style', 'if', 'for', 'tid'],
    text: ['class', 'style', 'if'],
    input: ['id', 'class', 'style', 'if', 'type', 'value', 'disabled'],
    image: ['class', 'style', 'src'],
    picker: ['class', 'style', 'for', 'tid', 'type', 'range', 'selected']
  }
  const PROPERTIES = new Set(('width height padding padding-bottom flex-direction flex-shrink align-items justify-content color font-size font-weight text-align border-radius margin-left margin-right background-color background-size background-position background-repeat background-image selected-color selected-background-color selected-font-size').split(' '))
  const NATIVE = new Set(['selected-color', 'selected-background-color', 'selected-font-size'])
  const fail = message => { throw new Error(message) }
  const nativeName = name => NATIVE.has(name) ? `--picker-${name}` : name

  function expression(source, bindingNames) {
    let rest = source.trim()
    let previous = ''
    if (!rest) fail('Empty binding')
    while (rest) {
      const token = rest.match(/^(?:\s+|'(?:[^'\\]|\\.)*'|\d+|[A-Za-z_$][\w$]*|===|!==|&&|\|\||[.!?:+>\[\]()])/)
      if (!token || rest.startsWith('++') || (token[0] === '(' && /[\w$\])'"]$/.test(previous))) fail(`Unsupported binding construct: {{ ${source} }}`)
      if (/^(?:constructor|prototype|__proto__|this|new|function|window|globalThis|eval)$/.test(token[0])) fail(`Unsupported binding name: ${token[0]}`)
      if (bindingNames && /^[A-Za-z_$][\w$]*$/.test(token[0]) && previous !== '.' && !bindingNames.has(token[0])) fail(`Unknown source binding: ${token[0]}`)
      if (token[0].trim()) previous = token[0]
      rest = rest.slice(token[0].length)
    }
    try { return new Function('scope', `with (scope) { return (${source}); }`) }
    catch (error) { fail(`Invalid binding {{ ${source} }}: ${error.message}`) }
  }

  function declarations(raw, assets) {
    return raw.split(';').filter(part => part.trim()).map(part => {
      const match = part.trim().match(/^([a-z-]+)\s*:\s*(.+)$/)
      if (!match || !PROPERTIES.has(match[1])) fail(`Unsupported CSS declaration: ${part.trim()}`)
      const [, name, value] = match
      if (!/^[\w\s#.%'"()/:+-]+$/.test(value)) fail(`Unsupported CSS value: ${value}`)
      for (const call of value.matchAll(/([\w-]+)\(/g)) {
        if (call[1] !== 'url') fail(`Unsupported CSS function: ${call[1]}`)
      }
      if (value.includes('url(')) {
        const url = value.match(/^url\(['"]?(\/common\/(?:icons\/)?[\w-]+\.png)['"]?\)$/)?.[1]
        if (!url || !assets.includes(url)) fail(`Unknown CSS asset: ${value}`)
      }
      if (host.CSS && !/__BIND_\d+__/.test(value) && !host.CSS.supports(name.replace(/^selected-/, ''), value)) fail(`Browser cannot render source CSS: ${name}: ${value}`)
      return `${nativeName(name)}: ${value}`
    }).join('; ')
  }

  // Validate original tokens before HTML parsing or CSSOM can repair or discard them.
  function prepareSource(source, bindingNames) {
    const names = bindingNames && new Set([...bindingNames, '$item', 'true', 'false', 'null'])
    const functions = []
    const protectedTemplate = source.template.replace(/\{\{([\s\S]*?)\}\}/g, (_, value) => {
      functions.push(expression(value.trim(), names))
      return `__BIND_${functions.length - 1}__`
    })
    if (/\{\{|\}\}|__BIND_\d+__/.test(source.template.replace(/\{\{[\s\S]*?\}\}/g, ''))) fail('Malformed binding or reserved binding marker')
    const stack = []
    let html = ''
    let offset = 0
    const tags = /<\/?[a-z][^>]*>/g
    for (const token of protectedTemplate.matchAll(tags)) {
      const between = protectedTemplate.slice(offset, token.index)
      if (/[<>]/.test(between)) fail('Unsupported template construct before tag')
      html += between
      const parsed = token[0].match(/^<(\/)?([a-z]+)([\s\S]*?)(\/?)>$/)
      if (!parsed || !Object.hasOwn(ATTRIBUTES, parsed[2])) fail(`Unsupported source tag: ${token[0]}`)
      const [, closing, tag, body, selfClosing] = parsed
      if (closing) {
        if (body.trim() || selfClosing || stack.pop() !== tag) fail(`Unbalanced source tag: ${token[0]}`)
        if (tag !== 'image') html += `</${tag === 'text' ? 'vela-text' : tag === 'picker' ? 'vela-picker' : tag}>`
      } else {
        const attributes = []
        const seen = new Set()
        let remaining = body
        while (remaining.trim()) {
          const attr = remaining.match(/^\s+([a-z]+(?:-[a-z]+)*)="([^"]*)"/)
          if (!attr) fail(`Unsupported attributes on ${tag}: ${remaining}`)
          const [, name, value] = attr
          if (seen.has(name)) fail(`Duplicate ${name} on ${tag}`)
          seen.add(name)
          if (EVENTS.has(name)) {
            if (!/^[a-zA-Z]\w*(?:\((?:\$item\.(?:id|index)|'[a-z]+')\))?$/.test(value)) fail(`Unsupported event binding: ${value}`)
          } else {
            if (!ATTRIBUTES[tag].includes(name)) fail(`Unsupported attribute ${name} on ${tag}`)
            if (name === 'style') declarations(value, source.assets)
            if (['if', 'for', 'range', 'selected', 'disabled'].includes(name) && !/^__BIND_\d+__$/.test(value)) fail(`Expected binding for ${name}`)
            if (name === 'tid' && !['id', 'index'].includes(value)) fail(`Unsupported list key: ${value}`)
            if (name === 'type' && value !== (tag === 'picker' ? 'text' : 'button')) fail(`Unsupported ${tag} type: ${value}`)
            if (name === 'src' && !/^__BIND_\d+__$/.test(value) && !source.assets.includes(value)) fail(`Unknown image asset: ${value}`)
            attributes.push(`${name === 'style' ? 'data-preview-style' : name}="${value}"`)
          }
          remaining = remaining.slice(attr[0].length)
        }
        if (tag === 'input' && !selfClosing) fail('Expected self-closing source input')
        if (tag !== 'input' && !selfClosing) stack.push(tag)
        html += `<${tag === 'image' ? 'img' : tag === 'text' ? 'vela-text' : tag === 'picker' ? 'vela-picker' : tag} ${attributes.join(' ')}>`
        if (selfClosing && !['input', 'image'].includes(tag)) html += `</${tag === 'text' ? 'vela-text' : tag === 'picker' ? 'vela-picker' : tag}>`
      }
      offset = token.index + token[0].length
    }
    const tail = protectedTemplate.slice(offset)
    if (/[<>]/.test(tail) || stack.length) fail('Unbalanced or unsupported template construct')
    html += tail
    const css = source.style.replace(/\/\*[\s\S]*?\*\//g, '')
    let end = 0
    let normalizedCss = ''
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (css.slice(end, rule.index).trim() || !/^\s*\.[a-z][a-z-]*\s*$/.test(rule[1])) fail(`Unsupported CSS selector: ${rule[1].trim()}`)
      normalizedCss += `${rule[1]} { ${declarations(rule[2], source.assets)} }\n`
      end = rule.index + rule[0].length
    }
    if (css.slice(end).trim()) fail('Unsupported CSS rule')
    return { html, css: normalizedCss, functions }
  }

  const NORMALIZATION = `
:host { display: block; width: 100%; height: 100%; font-family: Arial, sans-serif; }
* { box-sizing: border-box; }
div { display: flex; flex-direction: row; }
vela-text { display: flex; align-items: center; justify-content: center; white-space: pre-wrap; }
input { appearance: none; border: 0; padding: 0; margin: 0; font-family: inherit; text-align: center; opacity: 1; }
img { display: block; object-fit: contain; }
vela-picker { display: flex; flex-direction: column; height: 144px; overflow: hidden; }
.picker-candidate, .picker-current { display: flex; align-items: center; justify-content: center; height: calc(144px / 3); flex-shrink: 0; }
.picker-current { color: var(--picker-selected-color); background-color: var(--picker-selected-background-color); font-size: var(--picker-selected-font-size); }
`

  async function mount(device, payload) {
    const { source, snapshot, result } = payload
    if (result.status === 'failed') fail(result.diagnostics.join('\n'))
    const prepared = prepareSource(source, Object.keys(snapshot.bindings))
    const document = device.ownerDocument
    const inert = document.createElement('template')
    inert.innerHTML = prepared.html
    const evaluate = (value, scope) => prepared.functions[Number(value.match(/^__BIND_(\d+)__$/)?.[1])]?.(scope)
    const substitute = (value, scope) => value.replace(/__BIND_(\d+)__/g, (_, index) => {
      const output = prepared.functions[Number(index)](scope)
      if (!['string', 'number', 'boolean'].includes(typeof output)) fail(`Non-scalar binding ${index}`)
      return String(output)
    })
    const fragment = document.createDocumentFragment()
    let pickerColumn = 0
    function expand(node, scope, parent, inLoop = false) {
      if (node.nodeType === 3) { parent.append(document.createTextNode(substitute(node.textContent, scope))); return }
      if (node.nodeType !== 1) fail('Unsupported parsed node')
      if (node.hasAttribute('for') && !inLoop) {
        const items = evaluate(node.getAttribute('for'), scope)
        if (!Array.isArray(items)) fail('List binding must be an array')
        for (const item of items) expand(node, { ...scope, $item: item }, parent, true)
        return
      }
      if (node.hasAttribute('if') && !evaluate(node.getAttribute('if'), scope)) return
      const output = document.createElement(node.localName)
      for (const attr of node.attributes) {
        if (['if', 'for', 'tid', 'range', 'selected'].includes(attr.name)) continue
        const name = attr.name === 'data-preview-style' ? 'style' : attr.name
        let value = substitute(attr.value, scope)
        if (name === 'style') value = declarations(value, source.assets)
        if (name === 'src' && !source.assets.includes(value)) fail(`Unknown rendered asset: ${value}`)
        if (name === 'disabled') {
          if (evaluate(attr.value, scope)) output.setAttribute('disabled', '')
        } else output.setAttribute(name, value)
      }
      if (node.localName === 'vela-picker') {
        const digit = snapshot.pickerDigits[pickerColumn++]
        const range = evaluate(node.getAttribute('range'), scope)
        if (!Array.isArray(range) || !range.includes(digit)) fail('Picker digits must come from current BPM and belong to source range')
        const index = range.indexOf(digit)
        output.setAttribute('data-digit', digit)
        output.setAttribute('aria-label', `Static digit ${digit}`)
        for (const delta of [-1, 0, 1]) {
          const row = document.createElement('span')
          row.className = delta === 0 ? 'picker-current' : 'picker-candidate'
          row.textContent = range[index + delta] ?? ''
          output.append(row)
        }
      } else {
        for (const child of node.childNodes) expand(child, scope, output)
      }
      parent.append(output)
    }
    for (const node of inert.content.childNodes) expand(node, snapshot.bindings, fragment)
    const shadow = device.shadowRoot || device.attachShadow({ mode: 'open' })
    shadow.replaceChildren()
    const style = document.createElement('style')
    style.textContent = NORMALIZATION + prepared.css
    shadow.append(style, fragment)
    await document.fonts.ready
    const assets = new Set()
    const elements = [...shadow.querySelectorAll('*')].filter(element => element !== style)
    for (const element of elements) {
      if (element.localName === 'img') assets.add(element.getAttribute('src'))
      const background = host.getComputedStyle(element).backgroundImage
      for (const match of background.matchAll(/url\("?([^"()]+)"?\)/g)) {
        const url = new URL(match[1], document.baseURI)
        if (url.origin !== new URL(document.baseURI).origin || !source.assets.includes(url.pathname)) fail(`Unexpected rendered background asset: ${url}`)
        assets.add(url.pathname)
      }
    }
    await Promise.all([...shadow.querySelectorAll('img')].map(async image => {
      try { await image.decode() }
      catch { fail(`Cannot decode rendered image: ${image.getAttribute('src')}`) }
    }))
    const decoded = await Promise.all([...assets].map(async url => {
      const image = new host.Image()
      image.src = url
      try { await image.decode() }
      catch { fail(`Cannot decode asset: ${url}`) }
      if (!image.naturalWidth || !image.naturalHeight) fail(`Empty asset: ${url}`)
      return { url, width: image.naturalWidth, height: image.naturalHeight, hash: source.hashes[`src${url}`] }
    }))
    await new Promise(resolve => host.requestAnimationFrame(() => host.requestAnimationFrame(resolve)))
    const bounds = element => {
      const rect = element.getBoundingClientRect()
      const area = device.getBoundingClientRect()
      return { x: rect.x - area.x, y: rect.y - area.y, width: rect.width, height: rect.height }
    }
    const rendered = elements.map(element => {
      const css = host.getComputedStyle(element)
      return {
        tag: element.localName, class: element.className,
        text: element.localName === 'input' ? element.value : ['vela-text', 'span'].includes(element.localName) ? element.textContent : '',
        ...bounds(element), scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
        color: css.color, fontSize: css.fontSize, fontWeight: css.fontWeight,
        backgroundColor: css.backgroundColor, backgroundImage: css.backgroundImage
      }
    })
    if (elements.some(element => [...element.attributes].some(attr => /__BIND_|\{\{/.test(attr.value))) || /__BIND_|\{\{/.test(shadow.textContent.replace(style.textContent, ''))) fail('Unresolved rendered binding')
    const area = device.getBoundingClientRect()
    if (area.width !== payload.viewport.width || area.height !== payload.viewport.height) fail('Application area does not match preview viewport')
    const overflow = rendered.filter(item => item.x < -0.5 || item.y < -0.5 || item.x + item.width > area.width + 0.5 || item.y + item.height > area.height + 0.5 || item.scrollWidth > item.width + 1 || item.scrollHeight > item.height + 1)
    return {
      ...result, status: 'ready', caseId: snapshot.caseId,
      diagnostics: overflow.length ? ['Inspect overflow diagnostics. Browser font metrics are not native measurements.'] : [],
      rendered: { viewport: { width: area.width, height: area.height }, elements: rendered, assets: decoded, overflow, pickerDigits: [...shadow.querySelectorAll('[data-digit]')].map(element => element.dataset.digit).join('') }
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { prepareSource, mount }
  else {
    host.PreviewRenderer = { prepareSource, mount }
    host.__previewResult = { status: 'pending', diagnostics: [] }
    const document = host.document
    const diagnostics = document.getElementById('diagnostics')
    let pageFailed = false
    const failure = error => {
      pageFailed = true
      host.__previewResult = { ...host.__previewResult, status: 'failed', diagnostics: [...host.__previewResult.diagnostics, error.message] }
      diagnostics.textContent = `PREVIEW FAILED\n${host.__previewResult.diagnostics.join('\n')}`
      diagnostics.style.color = '#a00000'
      document.getElementById('capture').hidden = true
    }
    host.addEventListener('error', event => failure(event.error || new Error(event.message)))
    host.addEventListener('unhandledrejection', event => failure(event.reason instanceof Error ? event.reason : new Error(String(event.reason))))
    host.__previewReady = (async () => {
      const catalogResponse = await host.fetch('/catalog.json')
      if (!catalogResponse.ok) fail('Cannot load case catalog')
      const catalog = await catalogResponse.json()
      for (const item of catalog) {
        const link = document.createElement('a')
        link.href = `/?case=${encodeURIComponent(item.id)}`
        link.textContent = item.id
        document.getElementById('catalog').append(link)
      }
      const id = new URLSearchParams(host.location.search).get('case')
      if (!id) { diagnostics.textContent = 'Choose a static case. Controls inside the application area are inert.'; return host.__previewResult }
      const response = await host.fetch(`/case/${encodeURIComponent(id)}.json`)
      if (!response.ok) fail(`Unknown or unavailable case: ${id}`)
      const payload = await response.json()
      if (pageFailed) return host.__previewResult
      host.__previewResult = payload.result
      document.getElementById('case-caption').textContent = `${id} · ${payload.case?.route || ''} · ${payload.case?.locale || ''}`
      document.getElementById('capture').hidden = false
      const rendered = await mount(document.getElementById('device'), payload)
      if (pageFailed) return host.__previewResult
      host.__previewResult = rendered
      diagnostics.textContent = JSON.stringify(host.__previewResult, null, 2)
      return host.__previewResult
    })().catch(error => { failure(error); return host.__previewResult })
  }
})(typeof window === 'undefined' ? globalThis : window)
