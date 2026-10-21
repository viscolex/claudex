import type { ClientModule } from 'claude-code'

// The pane's sections as tiles, drawn on the surface so a whole card answers
// the pointer (a Button draws its children on one line), lights up under it,
// and takes the arrow keys and 1-4 once clicked. After Branchline's.

export type TileSpec = { id: string; label: string; value: string; sub: string; c: string; sel: boolean; alert?: boolean }
export type TilesProps = { tiles: TileSpec[]; card: string; line: string }
type Local = { hover: number; ref: { unpoint?: () => void; unkey?: () => void } }

const Tiles: ClientModule<TilesProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { hover: -1, ref: {} }
    surface.setState(state)
  }
  const count = Math.max(1, props.tiles.length)
  const cols = surface.columns
  const perRow = cols <= 0 || cols >= 64 ? count : 2
  const rowsOfTiles = Math.ceil(count / perRow)
  state.ref.unpoint = surface.onPointer(e => {
    const cur = surface.state ?? state
    const w = Math.max(1, surface.columns / perRow)
    const h = Math.max(1, surface.rows / rowsOfTiles)
    const inside = e.x >= 0 && e.y >= 0 && e.x < surface.columns && e.y < surface.rows
    const at = inside ? Math.min(count - 1, Math.floor(e.y / h) * perRow + Math.min(perRow - 1, Math.floor(e.x / w))) : -1
    if (e.type === 'leave' || !inside) {
      if (cur.hover !== -1) surface.setState({ ...cur, hover: -1 })
      return
    }
    if (e.type === 'move' && cur.hover !== at) surface.setState({ ...cur, hover: at })
    if (e.type === 'down' && (e.button ?? 'left') === 'left') {
      const t = props.tiles[at]
      if (t) surface.post({ tab: t.id })
    }
  })
  state.ref.unkey = surface.onKey(e => {
    const sel = Math.max(0, props.tiles.findIndex(t => t.sel))
    const digit = Number(e.key)
    const to = e.key === 'left' || e.key === 'h' ? sel - 1 : e.key === 'right' || e.key === 'l' ? sel + 1 : digit >= 1 && digit <= count ? digit - 1 : -1
    const t = props.tiles[(to + count) % count]
    if (to !== -1 && t) surface.post({ tab: t.id })
  })
  const rows: TileSpec[][] = []
  for (let i = 0; i < props.tiles.length; i += perRow) rows.push(props.tiles.slice(i, i + perRow))
  return (
    <Box flexDirection="column" gap={1}>
      {rows.map((row, r) => (
        <Box key={`row${r}`} flexDirection="row" gap={1}>
          {row.map((t, i) => {
            const hot = state.hover === r * perRow + i
            return (
              <Box
                key={t.id}
                flexDirection="column"
                flexGrow={1}
                width={`${Math.floor(100 / perRow)}%`}
                borderStyle="round"
                borderColor={t.sel ? t.c : hot ? `${t.c}99` : t.alert ? `${t.c}66` : props.line}
                backgroundColor={t.sel ? `${t.c}24` : hot ? '#8080801c' : props.card}
                paddingX={2}
                paddingY={perRow < count ? 0 : 1}
              >
                <Text size="caption" weight="bold" color={t.sel || hot || t.alert ? t.c : undefined} dimColor={!t.sel && !hot && !t.alert}>
                  {t.label}
                </Text>
                <Text size="title" weight="bold" tabular>
                  {t.value}
                </Text>
                <Text size="footnote" color={t.sel || t.alert ? t.c : undefined} dimColor={!t.sel && !t.alert} wrap="truncate-end">
                  {t.sub}
                </Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

export default Tiles
