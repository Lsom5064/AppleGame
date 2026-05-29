declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.mp3" {
  const src: string;
  export default src;
}
