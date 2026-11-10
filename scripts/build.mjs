// Generates the Cyberpunk, Cyberpunk Umbra and Cyberpunk Scarlet app and terminal themes from the
// vendored upstream themes.
// Usage: node scripts/build.mjs           write themes/, terminal/, scripts/curation.json and
//                                         scripts/deviations.json
//        node scripts/build.mjs --check   exit 1 if a committed file differs from the output
//
// Upstream's themes mix their own neon colors with colors left over from the Material Theme and
// VS Code Dark+ templates they started from. Each style gets a CORE palette, read from its own
// upstream colors by role. A color from LEFTOVERS never ships: the token or rule that carries one
// takes the core color with the same role, and scripts/curation.json records the change.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PALETTE = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'cyberpunk-palette.json'), 'utf8'))
const STYLES = PALETTE.styles

// Template colors upstream did not choose for this theme.
const LEFTOVERS = {
  '#c792ea': 'Material Theme purple',
  '#ffcb6b': 'Material Theme yellow',
  '#f78c6c': 'Material Theme orange',
  '#c17e70': 'Material Theme brown',
  '#f07178': 'Material Theme red',
  '#c3e88d': 'Material Theme green',
  '#ff5370': 'Material Theme error red',
  '#82aaff': 'Material Theme blue',
  '#89ddff': 'Material Theme cyan',
  '#65737e': 'Material Theme comment grey',
  '#eeffff': 'Material Theme foreground',
  '#00000050': 'Material Theme translucent black',
  '#6796e6': 'VS Code Dark+ info',
  '#cd9731': 'VS Code Dark+ warning',
  '#f44747': 'VS Code Dark+ error',
  '#b267e6': 'VS Code Dark+ debug'
}

// The core palette: each role reads one upstream color per style. A string is a workbench color,
// `{ syntax }` the foreground upstream's own rules give that selector, and `{ <style id>: ref }`
// a different source per style.
const CORE = {
  text: 'foreground',
  // The color each style is known by: mint for Cyberpunk and Umbra, scarlet for Scarlet.
  accent: 'editor.foreground',
  comment: { syntax: 'comment' },
  keyword: { syntax: 'keyword' },
  function: { syntax: 'entity.name.function' },
  string: { syntax: 'string' },
  number: { syntax: 'constant.numeric' },
  type: { syntax: 'support.class' },
  tag: { syntax: 'entity.name.tag' },
  attribute: { syntax: 'entity.other.attribute-name' },
  property: { syntax: 'source.css support.type.property-name' },
  blockVariable: { syntax: 'meta.block variable.other' },
  link: { syntax: 'string.other.link' },
  error: 'gitDecoration.deletedResourceForeground',
  success: 'gitDecoration.untrackedResourceForeground',
  info: 'gitDecoration.modifiedResourceForeground',
  warning: 'inputValidation.warningBorder',
  cyan: 'editorLineNumber.activeForeground',
  green: 'peekView.border',
  // A dark color in each style's own hue, for ANSI black. Like most themes' black, it may sit
  // close to the terminal background.
  lime: 'terminalCursor.foreground',
  method: { syntax: 'entity.name.method.js' },
  editorLink: 'editorLink.activeForeground',
  // Quiet fills: upstream's panel surface, which Scarlet paints like its canvas, so Scarlet takes
  // its dropdown fill.
  quiet: {
    cyberpunk: 'panel.background',
    'cyberpunk-umbra': 'panel.background',
    'cyberpunk-scarlet': 'dropdown.background'
  },
  // Hairlines: upstream's editor group border, which nearly matches Cyberpunk's canvas, so
  // Cyberpunk takes its title bar border.
  edge: {
    cyberpunk: 'titleBar.border',
    'cyberpunk-umbra': 'editorGroup.border',
    'cyberpunk-scarlet': 'editorGroup.border'
  },
  shade: {
    cyberpunk: 'tab.inactiveBackground',
    'cyberpunk-umbra': 'sideBar.background',
    'cyberpunk-scarlet': 'sideBarSectionHeader.background'
  },
  // Why Scarlet's selection highlight: its editor.selectionBackground is #000000, which barely
  // shows on its #101116 canvas. editor.selectionHighlightBackground is its own scarlet tint.
  selection: {
    cyberpunk: 'editor.selectionBackground',
    'cyberpunk-umbra': 'editor.selectionBackground',
    'cyberpunk-scarlet': 'editor.selectionHighlightBackground'
  }
}

// A plain string is an opaque workbench color. `from` is a workbench color or `{ core: role }`.
// `over` paints a translucent color onto that token, because Orca needs these tokens opaque;
// `keepAlpha` ships a translucent color as it is, for the tokens Orca paints over a surface.
// `readable` steps OKLCH lightness until the token reads at `min` (default 4.5:1) on each listed
// token. `chat` makes the token read at 4.5:1 where Orca's chat paints it: on the derived chat
// surfaces in `on` (a translucent token is painted over the surface named after it), first mixed
// with --foreground at `mixForeground` percent, as Orca mixes chat links and diff text. `curate`
// replaces a style's upstream color with another source, recorded in scripts/curation.json.
// `outOfGamut` names the core role a token takes when lightness alone reaches its floor only
// outside the sRGB gamut, which would shift its hue; the change is recorded in curation.json.
const APP_TOKENS = {
  '--background': 'editor.background',
  '--editor-surface': 'editor.background',
  // Why the workbench foreground: Orca's --foreground is the text of chat, settings and menus
  // as well as the editor, and upstream's workbench text is white. Its mint (Scarlet: scarlet)
  // editor.foreground stays the accent, so the strongest color marks action and state.
  '--foreground': 'foreground',
  // Why the hover widget: each upstream screenshot shows it, a near-black in the accent's hue.
  '--popover': { from: 'editorHoverWidget.background', over: '--background' },
  // Why editor.foreground: the hover text in each upstream screenshot is the editor text color.
  '--popover-foreground': { from: 'editor.foreground', readable: ['--popover'] },
  // Why the hover color: button.background is this color at 65%, so the hover is the button's
  // own opaque color.
  '--primary': {
    from: 'button.hoverBackground',
    curate: {
      'cyberpunk-scarlet': {
        to: { core: 'accent' },
        reason:
          "Scarlet copies Cyberpunk's mint button colors unchanged. Its own action color is its editor.foreground #ff0055, which it also uses for tab.activeBorder and panelTitle.activeBorder."
      }
    }
  },
  '--primary-foreground': 'button.foreground',
  // Why not input.background: it equals the hover widget in Cyberpunk and Umbra, so quiet fills
  // inside popovers (the command palette's input band, pinned rows) would vanish.
  '--muted': { from: { core: 'quiet' }, over: '--background' },
  // Why the inactive tab text: upstream sets no descriptionForeground, and its secondary labels
  // (inactive tabs, inactive panel titles, peek result lines) all use this tinted color. Its line
  // number color is not used: Cyberpunk's #9f5fff leaves the sRGB gamut before it reaches 4.5:1.
  '--muted-foreground': {
    from: 'tab.inactiveForeground',
    over: '--background',
    readable: ['--background', '--muted', '--popover']
  },
  // Why the suggest widget's selected row: Orca paints --accent for hovered and selected rows on
  // the canvas, in sidebars and inside popovers (command palette, menus, selects). Upstream's list
  // colors equal its hover widget in Umbra and its canvas in Scarlet, so a selected menu row
  // would vanish. This is the color upstream itself draws for the selected row of a popover.
  '--accent': { from: 'editorSuggestWidget.selectedBackground', over: '--background' },
  '--accent-foreground': { from: 'list.activeSelectionForeground', readable: ['--accent'], outOfGamut: 'tag' },
  '--border': { from: { core: 'edge' }, over: '--background' },
  // Why the cursor: Orca paints the editor cursor and selection (30%) with the ring, and upstream
  // sets no focusBorder.
  '--ring': 'editorCursor.foreground',
  '--sidebar': 'sideBar.background',
  '--sidebar-foreground': { from: 'sideBar.foreground', readable: ['--sidebar', ['--worktree-sidebar-active', '--sidebar']] },
  '--sidebar-border': 'sideBar.border',
  '--worktree-sidebar-active': { from: 'list.activeSelectionBackground', keepAlpha: true },
  '--host-badge': 'badge.background',
  '--host-badge-foreground': 'badge.foreground',
  '--tab-bar': 'editorGroupHeader.tabsBackground',
  '--tab-active': 'tab.activeBackground',
  '--tab-active-foreground': { from: 'tab.activeForeground', readable: ['--tab-active', '--tab-inactive'] },
  // Why the panel's active tab border: Cyberpunk and Umbra set no tab.activeBorder, and every
  // style draws its active panel tab with this line (Scarlet's tab.activeBorder is the same).
  '--tab-active-indicator': 'panelTitle.activeBorder',
  '--tab-inactive': 'tab.inactiveBackground',
  '--tab-inactive-foreground': { from: 'tab.inactiveForeground', over: '--tab-inactive', readable: ['--tab-inactive'] },
  '--split-divider': { from: 'editorGroup.border', over: '--background' },
  // Why the accent: upstream sets no sash.hoverBorder, and a dragged divider is an active state.
  '--split-divider-hover': { from: { core: 'accent' } },
  '--text-link': {
    from: 'textLink.foreground',
    readable: ['--editor-surface'],
    chat: { mixForeground: 30, on: ['userMessage', 'inlineCode', 'inlineCodeOnUserMessage'] },
    outOfGamut: 'info'
  },
  // Why the secondary text color: Orca's own chat muted text is --muted-foreground at 83% on the
  // chat canvas, under 4.5:1 when --muted-foreground sits near its floor on the canvas.
  '--chat-muted-foreground': { from: 'tab.inactiveForeground', over: '--background', chat: { on: ['canvas', 'codeBlock'] } },
  '--chat-selection': { from: { core: 'selection' }, over: '--background' },
  // Why the core roles: upstream sets no diffEditor overview or gutter color. The tints keep
  // upstream's own diffEditor colors.
  '--diff-added': {
    from: { core: 'success' },
    chat: { mixForeground: 30, on: [['--diff-added-background', 'canvas'], ['--diff-added-background', 'codeBlock']] }
  },
  '--diff-added-background': { from: 'diffEditor.insertedTextBackground', keepAlpha: true },
  '--diff-added-emphasis': { from: 'diffEditor.insertedTextBackground', keepAlpha: true },
  '--diff-removed': {
    from: { core: 'error' },
    chat: { mixForeground: 30, on: [['--diff-removed-background', 'canvas'], ['--diff-removed-background', 'codeBlock']] },
    outOfGamut: 'tag'
  },
  '--diff-removed-background': { from: 'diffEditor.removedTextBackground', keepAlpha: true },
  '--diff-removed-emphasis': { from: 'diffEditor.removedTextBackground', keepAlpha: true },
  // Upstream sets no added, renamed or copied color, and VS Code paints those like untracked files.
  '--git-decoration-added': 'gitDecoration.untrackedResourceForeground',
  '--git-decoration-modified': 'gitDecoration.modifiedResourceForeground',
  '--git-decoration-deleted': 'gitDecoration.deletedResourceForeground',
  '--git-decoration-renamed': 'gitDecoration.untrackedResourceForeground',
  '--git-decoration-untracked': 'gitDecoration.untrackedResourceForeground',
  '--git-decoration-copied': 'gitDecoration.untrackedResourceForeground',
  '--git-decoration-ignored': {
    from: 'gitDecoration.ignoredResourceForeground',
    over: '--sidebar',
    readable: ['--sidebar'],
    min: 3
  }
}
// Left out on purpose: scripts/derived-tokens.json lists each token Orca derives, with the reason.

// Each row takes the color and font style VS Code resolves for the exact selector in `from` from
// upstream's rules: the last rule listing it wins, per setting. `from` may be a descendant
// selector, which Orca does not read, so `scope` names the plain scopes it ships under.
// `role` is required when `from` resolves to a leftover: the row ships that core role instead,
// and `reason` says why that role.
const SYNTAX = [
  { name: 'Comments', from: 'comment', scope: ['comment', 'punctuation.definition.comment'] },
  {
    name: 'Variables',
    from: 'variable',
    scope: ['variable'],
    role: 'text',
    reason: 'Plain names read as text: upstream\'s own text color is its workbench foreground, which its "Colors" rule also uses.'
  },
  {
    name: 'Invalid',
    from: 'invalid',
    scope: ['invalid', 'invalid.illegal'],
    role: 'error',
    reason: "Invalid code is an error: upstream's own error red is gitDecoration.deletedResourceForeground."
  },
  { name: 'Keywords and storage', from: 'keyword', scope: ['keyword', 'storage.type', 'storage.modifier'] },
  { name: 'Control keywords', from: 'keyword.control', scope: ['keyword.control'] },
  {
    name: 'Punctuation',
    from: 'punctuation',
    scope: ['punctuation', 'meta.tag', 'punctuation.definition.tag', 'punctuation.section.embedded', 'keyword.other.template', 'keyword.other.substitution']
  },
  { name: 'Color constants', from: 'constant.other.color', scope: ['constant.other.color'] },
  { name: 'Tags', from: 'entity.name.tag', scope: ['entity.name.tag', 'meta.tag.sgml'] },
  {
    name: 'Functions',
    from: 'entity.name.function',
    scope: ['entity.name.function', 'meta.function-call', 'variable.function', 'support.function', 'keyword.other.special-method']
  },
  { name: 'Methods', from: 'entity.name.method.js', scope: ['entity.name.method.js'] },
  { name: 'Constructors', from: 'variable.function.constructor', scope: ['variable.function.constructor'] },
  { name: 'Support variables', from: 'support.other.variable', scope: ['support.other.variable'] },
  {
    name: 'Constants and numbers',
    from: 'constant.numeric',
    scope: ['constant.numeric', 'constant.language', 'support.constant', 'constant.character', 'constant.escape', 'variable.parameter']
  },
  { name: 'Units and other keywords', from: 'keyword.other', scope: ['keyword.other', 'keyword.other.unit'] },
  {
    name: 'Strings',
    from: 'string',
    scope: ['string', 'constant.other.symbol', 'constant.other.key', 'entity.other.inherited-class']
  },
  {
    name: 'Types and classes',
    from: 'support.class',
    scope: ['entity.name', 'support.type', 'support.class', 'support.type.sys-types', 'support.other.namespace.php', 'meta.use.php']
  },
  {
    name: 'CSS property names',
    from: 'source.css support.type.property-name',
    scope: ['support.type.property-name.css', 'support.type.property-name.scss', 'support.type.property-name.less']
  },
  {
    name: 'Modules and imports',
    from: 'entity.name.module.js',
    scope: ['entity.name.module.js', 'variable.import.parameter.js', 'variable.other.class.js']
  },
  { name: 'Language variables', from: 'variable.language', scope: ['variable.language'] },
  { name: 'Attributes', from: 'entity.other.attribute-name', scope: ['entity.other.attribute-name'] },
  {
    name: 'HTML attributes',
    from: 'text.html.basic entity.other.attribute-name.html',
    scope: ['entity.other.attribute-name.html']
  },
  { name: 'CSS classes', from: 'entity.other.attribute-name.class', scope: ['entity.other.attribute-name.class'] },
  {
    name: 'Inserted',
    from: 'markup.inserted',
    scope: ['markup.inserted'],
    role: 'success',
    reason: "Inserted lines are additions: upstream's own color for new files is gitDecoration.untrackedResourceForeground."
  },
  {
    name: 'Deleted',
    from: 'markup.deleted',
    scope: ['markup.deleted'],
    role: 'error',
    reason: "Deleted lines are removals: upstream's own color for deleted files is gitDecoration.deletedResourceForeground."
  },
  {
    name: 'Changed',
    from: 'markup.changed',
    scope: ['markup.changed'],
    role: 'keyword',
    reason: "Changed lines take upstream's own violet, the keyword color, the hue nearest the Material purple."
  },
  {
    name: 'Regular expressions',
    from: 'string.regexp',
    scope: ['string.regexp'],
    role: 'cyan',
    reason: "Regular expressions take upstream's own cyan, editorLineNumber.activeForeground, so they stand apart from the sky blue strings."
  },
  {
    name: 'Escape characters',
    from: 'constant.character.escape',
    scope: ['constant.character.escape'],
    role: 'cyan',
    reason: 'Escapes read as part of a string pattern, so they take the same cyan as regular expressions.'
  },
  {
    name: 'JSON keys',
    from: 'source.json meta.structure.dictionary.json support.type.property-name.json',
    // Why the plain scope too: Orca's JSON tokenizer emits string.key.json, which it colors by
    // support.type.property-name.
    scope: ['support.type.property-name.json', 'support.type.property-name'],
    role: 'keyword',
    reason: "The top-level key color takes upstream's own violet, the hue nearest the Material purple. Orca reads no nested-key selectors, so this is the only key level that ships."
  },
  {
    name: 'Markdown text',
    from: 'text.html.markdown',
    scope: ['text.html.markdown', 'punctuation.definition.list_item.markdown'],
    role: 'text',
    reason: "Markdown prose reads as text: upstream's own text color is its workbench foreground."
  },
  // Why no Material green: that rule writes "markup.heading | markup.heading entity.name" as one
  // selector, which VS Code never matches. Heading text is entity.name.section.markdown, which
  // upstream's entity.name rule colors mint, in VS Code and in Orca alike.
  { name: 'Headings', from: 'markup.heading', scope: ['markup.heading'] },
  {
    name: 'Heading marks',
    from: 'markup.heading.markdown punctuation.definition.heading.markdown',
    scope: ['punctuation.definition.heading.markdown'],
    role: 'type',
    reason: "The # marks take the mint that upstream's own entity.name rule gives the heading text."
  },
  {
    name: 'Inline code',
    from: 'text.html.markdown markup.inline.raw.markdown',
    scope: ['markup.inline.raw'],
    role: 'keyword',
    reason: "Inline code takes upstream's own violet, the hue nearest the Material purple."
  },
  {
    name: 'Inline code punctuation',
    from: 'text.html.markdown markup.inline.raw.markdown punctuation.definition.raw.markdown',
    scope: ['punctuation.definition.raw.markdown'],
    role: 'comment',
    reason: "Quiet Markdown syntax marks take upstream's own comment color."
  },
  {
    name: 'Italic',
    from: 'markup.italic',
    scope: ['markup.italic'],
    role: 'tag',
    reason: "Emphasis takes upstream's own pink, the tag color, the hue nearest the Material red."
  },
  {
    name: 'Bold',
    from: 'markup.bold',
    scope: ['markup.bold'],
    role: 'tag',
    reason: 'Strong emphasis takes the same pink as italic, as upstream gives both one color.'
  },
  {
    name: 'Underline',
    from: 'markup.underline',
    scope: ['markup.underline'],
    role: 'tag',
    reason: 'Underline is emphasis, so it takes the same pink as italic and bold.'
  },
  { name: 'Links', from: 'string.other.link', scope: ['string.other.link'] },
  {
    name: 'Link titles',
    from: 'string.other.link.title.markdown',
    scope: ['string.other.link.title.markdown'],
    role: 'link',
    reason: "Upstream's own String Link rule colors string.other.link mint. A later Material rule overrode the Markdown link."
  },
  {
    name: 'Link descriptions',
    from: 'string.other.link.description.title.markdown',
    scope: ['string.other.link.description.title.markdown'],
    role: 'link',
    reason: 'Link text takes the same link color as link titles.'
  },
  {
    name: 'Link references',
    from: 'constant.other.reference.link.markdown',
    scope: ['constant.other.reference.link.markdown'],
    role: 'number',
    reason: "A link reference is a constant: upstream's own constant color is the yellow of its numbers."
  },
  {
    name: 'Code blocks',
    from: 'markup.raw.block',
    scope: ['markup.raw.block'],
    role: 'keyword',
    reason: 'Code blocks take the same violet as inline code.'
  },
  {
    name: 'Fenced code',
    from: 'markup.raw.block.fenced.markdown',
    scope: ['markup.raw.block.fenced.markdown'],
    role: 'text',
    reason: "Fenced code text reads as text: upstream's own text color is its workbench foreground."
  },
  {
    name: 'Fence punctuation',
    from: 'punctuation.definition.fenced.markdown',
    scope: ['punctuation.definition.fenced.markdown'],
    role: 'comment',
    reason: "Quiet Markdown syntax marks take upstream's own comment color. The Material color is translucent black, which is invisible on these canvases."
  },
  {
    name: 'Fence language',
    from: 'variable.language.fenced.markdown',
    scope: ['variable.language.fenced.markdown'],
    role: 'comment',
    reason: "Quiet Markdown syntax marks take upstream's own comment color."
  },
  {
    name: 'Separators',
    from: 'meta.separator',
    scope: ['meta.separator'],
    role: 'comment',
    reason: "Quiet Markdown syntax marks take upstream's own comment color."
  },
  {
    name: 'Tables',
    from: 'markup.table',
    scope: ['markup.table'],
    role: 'text',
    reason: "Table text reads as text: upstream's own text color is its workbench foreground."
  },
  { name: 'Quotes', from: 'markup.quote', scope: ['markup.quote'] },
  {
    name: 'Log info',
    from: 'token.info-token',
    scope: ['token.info-token'],
    role: 'info',
    reason: "Info takes upstream's own info blue, inputValidation.infoBorder and the modified-file color."
  },
  {
    name: 'Log warnings',
    from: 'token.warn-token',
    scope: ['token.warn-token'],
    role: 'warning',
    reason: "Warnings take upstream's own warning orange, inputValidation.warningBorder."
  },
  {
    name: 'Log errors',
    from: 'token.error-token',
    scope: ['token.error-token'],
    role: 'error',
    reason: "Errors take upstream's own error red, gitDecoration.deletedResourceForeground."
  },
  {
    name: 'Log debug',
    from: 'token.debug-token',
    scope: ['token.debug-token'],
    role: 'keyword',
    reason: "Debug takes upstream's own violet, the hue nearest the Dark+ purple."
  }
]

// Orca terminal keys and their sources, in the APP_TOKENS forms; translucent colors are painted
// onto the terminal background. Upstream sets only the foreground and cursor, so VS Code paints
// the rest: the terminal on panel.background, the selection with editor.selectionBackground.
const TERMINAL = {
  background: 'panel.background',
  foreground: 'terminal.foreground',
  cursor: 'terminalCursor.foreground',
  cursorAccent: 'panel.background',
  selectionBackground: { from: { core: 'selection' } }
}
// Upstream sets no terminal.ansi* color, so VS Code shows its own defaults (these). Each slot takes
// the core role that plays its part instead, so all 16 colors come from the style. Slots are
// assigned in this order. A colored slot takes the first of its roles that is at least
// MIN_FILL_DISTANCE from the terminal foreground and from every colored slot before it; a fallback
// role must also read at 4.5:1 on the terminal background.
// Why cyan before blue: Cyberpunk's foreground is upstream's cyan, so its cyan slot falls back to
// the info blue, and the blue slots then step around it.
const ANSI = {
  black: ['#000000', 'shade', "a dark color in the style's own hue"],
  red: ['#cd3131', 'error', "upstream's error red"],
  green: ['#0dbc79', 'green', "upstream's peek view green"],
  yellow: ['#e5e510', 'warning', "upstream's warning orange, so it stays apart from bright yellow"],
  cyan: ['#11a8cd', 'cyan', "upstream's cyan, editorLineNumber.activeForeground", ['info']],
  blue: ['#2472c8', 'function', "upstream's function blue", ['info', 'editorLink']],
  magenta: ['#bc3fbc', 'keyword', "upstream's keyword violet"],
  white: ['#e5e5e5', 'blockVariable', "upstream's lavender white, its block variable color"],
  brightBlack: ['#666666', 'comment', "upstream's comment color"],
  brightRed: ['#f14c4c', 'tag', "upstream's tag pink"],
  brightGreen: ['#23d18b', 'type', "upstream's mint, its type color", ['lime']],
  brightYellow: ['#f5f543', 'number', "upstream's number yellow"],
  brightBlue: ['#3b8eea', 'string', "upstream's sky blue, its string color", ['method']],
  brightMagenta: ['#d670d6', 'attribute', "upstream's magenta, its attribute color"],
  brightCyan: ['#29b8db', 'property', "upstream's pale cyan, its CSS property color"],
  brightWhite: ['#e5e5e5', 'text', "upstream's white, its workbench foreground"]
}

// Mirrors the opaque text pairs, rings and git decoration checks in Orca's
// app-shell/appearance/plugin-theme-contrast-rules.ts, for the tokens this theme sets.
const CONTRAST_PAIRS = [
  ['--background', '--foreground'],
  ['--background', '--muted-foreground'],
  ['--editor-surface', '--foreground'],
  ['--editor-surface', '--muted-foreground'],
  ['--popover', '--popover-foreground'],
  ['--primary', '--primary-foreground'],
  ['--muted', '--muted-foreground'],
  ['--accent', '--accent-foreground'],
  ['--sidebar', '--sidebar-foreground'],
  ['--tab-active', '--tab-active-foreground'],
  ['--tab-inactive', '--tab-inactive-foreground'],
  ['--tab-inactive', '--tab-active-foreground'],
  ['--editor-surface', '--text-link']
]
// Translucent surfaces, checked as Orca paints them: over the opaque token named.
const PAINTED_PAIRS = [
  ['--worktree-sidebar-active', '--sidebar', '--sidebar-foreground'],
  ['--host-badge', '--sidebar', '--host-badge-foreground'],
  ['--diff-added-background', '--editor-surface', '--foreground'],
  ['--diff-added-emphasis', '--editor-surface', '--foreground'],
  ['--diff-removed-background', '--editor-surface', '--foreground'],
  ['--diff-removed-emphasis', '--editor-surface', '--foreground']
]
const RINGS = [
  ['--ring', '--background'],
  ['--ring', '--sidebar'],
  ['--tab-active-indicator', '--tab-active']
]
const GIT_DECORATIONS = ['added', 'modified', 'deleted', 'renamed', 'untracked', 'copied', 'ignored']
const MIN_TEXT_CONTRAST = 4.5
const MIN_STATUS_CONTRAST = 3
const MIN_RING_CONTRAST = 2
const MIN_SYNTAX_CONTRAST = 3
// Why OKLab distance, not a contrast ratio: a row fill differs from its surface in hue as much as
// in lightness. 0.06 is about three just-noticeable differences (0.02 each), so a hovered or
// selected row stays plain to see on every surface it is painted on.
const MIN_FILL_DISTANCE = 0.06
const FILL_SURFACES = {
  '--accent': ['--background', '--popover', '--sidebar'],
  '--muted': ['--background', '--popover'],
  '--border': ['--background']
}
// Why above Orca's floors: margin so rounding in another color pipeline cannot tip a shade under.
const MARGIN = 0.05

const parseHex = (hex) => {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
  if (!match) {
    throw new Error(`not a hex color: ${hex}`)
  }
  const rgb = [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16))
  return [...rgb, match[2] ? parseInt(match[2], 16) / 255 : 1]
}
const toHex = (rgb) =>
  `#${rgb
    .slice(0, 3)
    .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0'))
    .join('')}`
const isTranslucent = (hex) => hex.length > 7 && !hex.endsWith('ff')

/** The opaque color a translucent `top` paints over an opaque `bottom`. */
function over(top, bottom) {
  const [r, g, b, a] = parseHex(top)
  const [br, bg, bb] = parseHex(bottom)
  return toHex([r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)])
}

function luminance(hex) {
  const [r, g, b] = parseHex(hex).slice(0, 3).map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToOklab(hex) {
  const [r, g, b] = parseHex(hex).slice(0, 3).map((c) => toLinear(c / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return toHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ].map((c) => fromLinear(Math.min(1, Math.max(0, c))) * 255)
  )
}

const lch = (hex) => {
  const [L, a, b] = hexToOklab(hex)
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI }
}
const hueGap = (x, y) => Math.abs(((y - x + 540) % 360) - 180)

/** Euclidean distance in OKLab, the measure MIN_FILL_DISTANCE uses. */
function fillDistance(x, y) {
  const [a, b] = [hexToOklab(x), hexToOklab(y)]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Raises OKLCH lightness (a, b kept: chroma and hue) until `ratioOf` the color reaches `target`. */
function readable(hex, ratioOf, target) {
  const [L, a, b] = hexToOklab(hex)
  let shipped = hex
  for (let next = L; ratioOf(shipped) < target; next += 0.001) {
    if (next > 1) {
      throw new Error(`cannot reach ${target}:1 for ${hex}`)
    }
    shipped = oklabToHex([next, a, b])
  }
  return shipped
}

/** Whether two colors differ in OKLCH lightness only, within the tolerances verify.mjs allows. */
function lightnessOnly(before, after) {
  const [x, y] = [lch(before), lch(after)]
  return Math.abs(y.C - x.C) <= 0.01 && (Math.min(x.C, y.C) <= 0.02 || hueGap(x.h, y.h) <= 3)
}

const mix = (a, b, percent) => {
  const [x, y] = [parseHex(a), parseHex(b)]
  return toHex(x.map((channel, index) => channel * (percent / 100) + y[index] * (1 - percent / 100)))
}
const withAlpha = (hex, alpha) => `${hex.slice(0, 7)}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`

/** The chat surfaces Orca derives for a dark theme that sets none of them (plugin-theme-css-fallbacks.ts). */
function chatSurfaces(foreground, background) {
  const canvas = mix(foreground, background, 5)
  const userMessage = mix(foreground, canvas, 7)
  return {
    canvas,
    userMessage,
    codeBlock: over(withAlpha(foreground, 0.035), canvas),
    inlineCode: over(withAlpha(foreground, 0.06), canvas),
    inlineCodeOnUserMessage: over(withAlpha(foreground, 0.06), userMessage)
  }
}

/** The settings VS Code resolves for exactly this selector: per setting, the last rule listing it. */
function upstreamStyle(style, selector) {
  const settings = {}
  for (const rule of style.tokenColors) {
    const selectors = [rule.scope ?? []].flat().flatMap((scope) => scope.split(','))
    if (selectors.some((scope) => scope.trim() === selector)) {
      Object.assign(settings, rule.settings)
    }
  }
  if (!Object.keys(settings).length) {
    throw new Error(`${style.name} has no token rule for "${selector}"`)
  }
  return settings
}

/** The foreground VS Code gives a plain scope from upstream's plain selectors: the longest
 *  dot-prefix wins, the later rule on a tie. Undefined when no rule reaches it. */
function upstreamForeground(style, scope) {
  let best
  for (const rule of style.tokenColors) {
    const selectors = [rule.scope ?? []].flat().flatMap((entry) => entry.split(',')).map((entry) => entry.trim())
    for (const selector of selectors.filter((entry) => entry && !/\s/.test(entry))) {
      if (rule.settings.foreground && (scope === selector || scope.startsWith(`${selector}.`))) {
        const score = selector.split('.').length
        if (!best || score >= best.score) {
          best = { score, color: normalize(rule.settings.foreground) }
        }
      }
    }
  }
  return best?.color
}

const normalize = (hex) => {
  const lower = hex.toLowerCase()
  return lower.length === 9 && lower.endsWith('ff') ? lower.slice(0, 7) : lower
}

/** A workbench color from upstream's theme file for this style, as #rrggbb or #rrggbbaa. */
function workbench(style, name) {
  const value = style.colors[name]
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) {
    throw new Error(`${style.name} sets no color "${name}"`)
  }
  return normalize(value)
}

function corePalette(id, style) {
  const resolveRef = (ref) => {
    if (typeof ref === 'string') {
      return { source: ref, color: workbench(style, ref) }
    }
    if (ref.syntax) {
      const { foreground } = upstreamStyle(style, ref.syntax)
      if (!foreground) {
        throw new Error(`${id}: upstream gives "${ref.syntax}" no foreground`)
      }
      return { source: ref.syntax, color: normalize(foreground) }
    }
    if (!ref[id]) {
      throw new Error(`core role has no source for ${id}`)
    }
    return resolveRef(ref[id])
  }
  const core = {}
  for (const [role, ref] of Object.entries(CORE)) {
    const { source, color } = resolveRef(ref)
    if (LEFTOVERS[color]) {
      throw new Error(`${id}: core role ${role} reads ${source}, a ${LEFTOVERS[color]} leftover`)
    }
    core[role] = { source, color }
  }
  return core
}

function build(id, style, records) {
  const core = corePalette(id, style)
  const deviate = (kind, name, from, upstream, shipped) =>
    records.deviations.push({ theme: id, kind, name, source: from, upstream, shipped })
  const curate = (kind, name, source, upstream, role, shipped, reason) =>
    records.curation.push({ style: id, kind, name, source, upstream, role, shipped, reason })

  const syntax = {}
  for (const row of SYNTAX) {
    const settings = upstreamStyle(style, row.from)
    const upstream = settings.foreground ? normalize(settings.foreground) : undefined
    let color = upstream
    if (upstream && LEFTOVERS[upstream]) {
      if (!row.role) {
        throw new Error(`${id}: "${row.name}" (${row.from}) is ${upstream}, a ${LEFTOVERS[upstream]} leftover, and the row names no role`)
      }
      color = core[row.role].color
      curate('syntax', row.name, row.from, upstream, row.role, color, row.reason)
    } else if (row.role) {
      throw new Error(`${id}: "${row.name}" names a role, but upstream's ${upstream ?? 'missing'} color is no leftover`)
    }
    // Why: a scope the row adds can reach a leftover in VS Code through a shorter upstream rule.
    for (const scope of row.role ? [] : row.scope) {
      const reached = upstreamForeground(style, scope)
      if (reached && LEFTOVERS[reached]) {
        throw new Error(`${id}: "${row.name}" ships ${scope}, which upstream colors ${reached}, a ${LEFTOVERS[reached]} leftover. Drop the scope or curate it`)
      }
    }
    syntax[row.name] = { settings, color }
  }

  const label = (ref) => (typeof ref === 'string' ? ref : `${core[ref.core].source} (${ref.core})`)
  const read = (ref) => (typeof ref === 'string' ? workbench(style, ref) : core[ref.core].color)
  /** A table entry's source and color: curated for this style, then painted onto `beneath(spec)`
   *  when translucent, unless it keeps its alpha. */
  const pick = (kind, name, mapping, beneath) => {
    const spec = typeof mapping === 'string' ? { from: mapping } : mapping
    let source = label(spec.from)
    let value = read(spec.from)
    const curation = spec.curate?.[id]
    if (curation) {
      const to = read(curation.to)
      curate(kind, name, source, value, curation.to.core ?? label(curation.to), to, curation.reason)
      ;[source, value] = [label(curation.to), to]
    }
    if (!isTranslucent(value)) {
      value = value.slice(0, 7)
    } else if (!spec.keepAlpha) {
      const surface = beneath(spec)
      if (!surface) {
        throw new Error(`${id}: ${name} reads translucent ${value} from ${source}; give it \`over\` or \`keepAlpha\``)
      }
      value = over(value, surface)
    }
    return { spec, source, value }
  }

  const tokens = {}
  const resolve = (token) => {
    if (token in tokens) {
      return tokens[token]
    }
    if (!APP_TOKENS[token]) {
      throw new Error(`${token} is not set by this theme`)
    }
    const picked = pick('app', token, APP_TOKENS[token], (spec) => spec.over && resolve(spec.over))
    const { spec, source } = picked
    let { value } = picked
    if (spec.readable || spec.chat) {
      const min = spec.min ?? MIN_TEXT_CONTRAST
      const chat = chatSurfaces(resolve('--foreground'), resolve('--background'))
      const surface = (name) => (name.startsWith('--') ? resolve(name) : chat[name])
      const paint = (layers) => (Array.isArray(layers) ? over(surface(layers[0]), surface(layers[1])) : surface(layers))
      const surfaces = (spec.readable ?? []).map(paint)
      const chatOn = (spec.chat?.on ?? []).map(paint)
      const chatText = (color) => (spec.chat?.mixForeground ? mix(resolve('--foreground'), color, spec.chat.mixForeground) : color)
      const ratioOf = (color) =>
        Math.min(...surfaces.map((on) => contrast(color, on)), ...chatOn.map((on) => contrast(chatText(color), on)))
      const shipped = readable(value, ratioOf, min + MARGIN)
      if (lightnessOnly(value, shipped)) {
        if (shipped !== value) {
          deviate('app', token, source, value, shipped)
        }
        value = shipped
      } else if (spec.outOfGamut && ratioOf(core[spec.outOfGamut].color) >= min + MARGIN) {
        const neighbor = core[spec.outOfGamut].color
        curate(
          'app',
          token,
          source,
          value,
          spec.outOfGamut,
          neighbor,
          `Lightness alone reaches ${min}:1 only outside the sRGB gamut (${value} to ${shipped}, a hue shift), so it takes the neighboring ${spec.outOfGamut} role, ${core[spec.outOfGamut].source}.`
        )
        value = neighbor
      } else {
        throw new Error(`${id}: ${token} reaches ${min}:1 only by leaving the sRGB gamut (${value} to ${shipped})`)
      }
    }
    tokens[token] = value
    return value
  }
  for (const token of Object.keys(APP_TOKENS)) {
    resolve(token)
  }

  const fail = (message) => {
    throw new Error(`${id}: ${message}`)
  }
  for (const [surface, text] of CONTRAST_PAIRS) {
    const ratio = contrast(tokens[surface], tokens[text])
    if (ratio < MIN_TEXT_CONTRAST) {
      fail(`${surface}/${text} is ${ratio.toFixed(2)}:1, under ${MIN_TEXT_CONTRAST}:1`)
    }
  }
  for (const [surface, beneath, text] of PAINTED_PAIRS) {
    const ratio = contrast(over(tokens[surface], tokens[beneath]), tokens[text])
    if (ratio < MIN_TEXT_CONTRAST) {
      fail(`${surface} over ${beneath} with ${text} is ${ratio.toFixed(2)}:1, under ${MIN_TEXT_CONTRAST}:1`)
    }
  }
  for (const [ring, surface] of RINGS) {
    const ratio = contrast(tokens[ring], tokens[surface])
    if (ratio < MIN_RING_CONTRAST) {
      fail(`${ring}/${surface} is ${ratio.toFixed(2)}:1, under ${MIN_RING_CONTRAST}:1`)
    }
  }
  for (const [fill, surfaces] of Object.entries(FILL_SURFACES)) {
    for (const surface of surfaces) {
      const distance = fillDistance(tokens[fill], tokens[surface])
      if (distance < MIN_FILL_DISTANCE) {
        fail(`${fill} is ${distance.toFixed(3)} from ${surface} in OKLab, under ${MIN_FILL_DISTANCE}`)
      }
    }
  }
  for (const status of GIT_DECORATIONS) {
    const ratio = contrast(tokens[`--git-decoration-${status}`], tokens['--sidebar'])
    if (ratio < MIN_STATUS_CONTRAST) {
      fail(`--git-decoration-${status} is ${ratio.toFixed(2)}:1 on --sidebar, under ${MIN_STATUS_CONTRAST}:1`)
    }
  }

  const editor = tokens['--editor-surface']
  const tokenColors = SYNTAX.map(({ name, from, scope }) => {
    const { settings: upstreamSettings, color } = syntax[name]
    const settings = {}
    if (color) {
      const painted = isTranslucent(color) ? over(color, editor) : color.slice(0, 7)
      const shipped = readable(painted, (candidate) => contrast(candidate, editor), MIN_SYNTAX_CONTRAST + MARGIN)
      if (!lightnessOnly(painted, shipped)) {
        throw new Error(`${id}: ${name} reaches ${MIN_SYNTAX_CONTRAST}:1 only by leaving the sRGB gamut`)
      }
      if (shipped !== painted) {
        deviate('syntax', name, from, painted, shipped)
      }
      settings.foreground = shipped
    }
    if (upstreamSettings.fontStyle !== undefined) {
      // Why: VS Code reads upstream's "normal" as no style, which Orca writes as "".
      settings.fontStyle = upstreamSettings.fontStyle === 'normal' ? '' : upstreamSettings.fontStyle
    }
    if (!Object.keys(settings).length) {
      fail(`"${name}" ships no setting`)
    }
    return { name, scope, settings }
  })

  const terminalBackground = pick('terminal', 'background', TERMINAL.background, () => null).value
  const terminal = {}
  for (const [key, mapping] of Object.entries(TERMINAL)) {
    terminal[key] = pick('terminal', key, mapping, () => terminalBackground).value
  }
  const ACHROMATIC = ['black', 'white', 'brightBlack', 'brightWhite']
  // Why exempt a normal and bright pair of one name: by terminal convention the bright color is a
  // lighter version of the same color, so the two are meant to look alike.
  const sameName = (x, y) => x.replace(/^bright/, '').toLowerCase() === y.replace(/^bright/, '').toLowerCase()
  const colored = []
  for (const [key, [vscodeDefault, preferred, why, fallbacks = []]] of Object.entries(ANSI)) {
    const slot = (role) => pick('terminal', key, { from: { core: role } }, () => terminalBackground).value
    const clash = (role) => {
      const color = slot(role)
      if (ACHROMATIC.includes(key)) {
        return null
      }
      if (fillDistance(color, terminal.foreground) < MIN_FILL_DISTANCE) {
        return `the terminal foreground ${terminal.foreground}`
      }
      const near = colored.find((other) => !sameName(key, other) && fillDistance(color, terminal[other]) < MIN_FILL_DISTANCE)
      if (near) {
        return `${near} ${terminal[near]}`
      }
      return role !== preferred && contrast(color, terminalBackground) < MIN_TEXT_CONTRAST ? `under ${MIN_TEXT_CONTRAST}:1 on the terminal background` : null
    }
    const first = clash(preferred)
    const role = [preferred, ...fallbacks].find((candidate) => !clash(candidate))
    if (!role) {
      fail(`ANSI ${key} has no role that is ${MIN_FILL_DISTANCE} from the terminal foreground and the slots before it, and readable: ${[preferred, ...fallbacks].map((candidate) => `${candidate} (${clash(candidate)})`).join(', ')}`)
    }
    const reason =
      role === preferred
        ? `This slot takes ${why} (${core[preferred].source}).`
        : `It would take ${why}, which sits within ${MIN_FILL_DISTANCE} of ${first}, so it takes the ${role} role (${core[role].source}).`
    terminal[key] = slot(role)
    if (!ACHROMATIC.includes(key)) {
      colored.push(key)
    }
    curate(
      'terminal',
      key,
      `VS Code default terminal.ansi${key[0].toUpperCase()}${key.slice(1)}`,
      vscodeDefault,
      role,
      terminal[key],
      `Upstream sets no ANSI colors, so VS Code shows its own. ${reason}`
    )
  }
  const ansi = Object.keys(ANSI).map((key) => terminal[key])
  if (new Set(ansi).size !== ansi.length) {
    fail(`two ANSI slots share a color: ${ansi.join(' ')}`)
  }

  records.core[id] = core
  return {
    [`themes/${id}.json`]: { base: 'dark', tokens, tokenColors },
    [`terminal/${id}.json`]: { schemaVersion: 1, mode: 'dark', terminal }
  }
}

function assertUniqueScopes() {
  const seen = new Set()
  for (const scope of SYNTAX.flatMap((rule) => rule.scope)) {
    if (seen.has(scope)) {
      throw new Error(`scope "${scope}" is listed twice; the later rule would silently win`)
    }
    seen.add(scope)
  }
}

assertUniqueScopes()
const records = { deviations: [], curation: [], core: {} }
const files = {}
for (const [id, style] of Object.entries(STYLES)) {
  Object.assign(files, build(id, style, records))
}
files['scripts/core-palette.json'] = records.core
files['scripts/curation.json'] = records.curation
files['scripts/deviations.json'] = records.deviations

// Upstream colors with alpha are first painted onto the surface beneath, as Orca and VS Code do;
// `upstream` below is that painted color.
console.log('Colors changed in OKLCH lightness only (app text to 4.5:1, git status to 3:1, syntax to 3:1 on the editor):')
for (const { theme, kind, name, source: from, upstream, shipped } of records.deviations) {
  console.log(`${theme.padEnd(18)} ${kind.padEnd(7)} ${name.padEnd(28)} ${from.padEnd(44)} ${upstream}  ${shipped}`)
}
console.log(`Role changes (scripts/curation.json): ${records.curation.length} rows.`)

const check = process.argv.includes('--check')
const stale = []
for (const [relative, data] of Object.entries(files)) {
  const file = path.join(ROOT, relative)
  const text = `${JSON.stringify(data, null, 2)}\n`
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      stale.push(relative)
    }
  } else {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
}
if (stale.length) {
  console.error(`Out of date (run node scripts/build.mjs): ${stale.join(', ')}`)
  process.exit(1)
}
console.log(check ? `All ${Object.keys(files).length} generated files are up to date.` : `Wrote ${Object.keys(files).length} files.`)
