const minMajor = 20;
const major = Number.parseInt(process.versions.node.split(".")[0], 10);

if (major >= minMajor) {
  process.exit(0);
}

const nvmrc = "20.19.6";
console.error(`
Node ${process.version} is too old for this repo (requires Node >= ${minMajor}).

Terminal (Vite 7) fails with: crypto.hash is not a function

Fix (pick one):
  1. nvm:     cd ${process.cwd()} && nvm install && nvm use
  2. Herd:    use Node ${nvmrc} in the Herd app, then open a new terminal
  3. PATH:    export PATH="$HOME/Library/Application Support/Herd/config/nvm/versions/node/v${nvmrc}/bin:$PATH"

Then run:  node -v   (should show v20+)   &&   npm run dev
`);
process.exit(1);
