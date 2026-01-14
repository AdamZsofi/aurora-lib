export type Paper = {
  id?: string
  title?: string
  authors?: string | string[]
  doi?: string
  ref?: string
  year?: string | number
  files?: string[]
  raw?: any
  tags?: string[]
}
