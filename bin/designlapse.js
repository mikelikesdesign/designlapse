#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { add, iterate, build, list, FRAMES } from '../src/project.js';
import { dev } from '../src/dev.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELP = `designlapse — scrub through a design step by step

Usage
  designlapse add <final.html> [options]       Add a design from its finished HTML. Pieces tagged
                                               data-step="1", "2", … become the build-up steps.
      --title "<name>"                         Name shown in the design picker
      --prompt "<request>"                     The request the design answers
      --name <slug>                            File name (default: from the title)
      --frame phone|tablet|browser|none        Device frame (default: phone)
      --url <text>                             Address shown in the browser frame
      --force                                  Replace an existing design with the same name

  designlapse iterate <name> <step.html> [--from <step>]
                                               Add a step to a design. With --from, it continues from
                                               that step (a branch if it isn't the latest one).

  designlapse build                            Rebuild the page from every design in the folder
  designlapse dev [--port 4321]                Serve the page and reload it whenever a design changes
  designlapse list                             List designs and their steps
  designlapse instructions                     Print the guide for AI agents (AGENTS.md)

Options for every command
  --dir <folder>                               Project folder (default: designs)
  --open                                       Open the page in your browser afterwards

The page is <dir>/designlapse.html. Add #<name>/step-<n> to its address to open a specific step.`;

function parse(argv) {
  const args = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) opts[k] = v;
      else if (['force', 'open'].includes(k)) opts[k] = true;
      else { if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`); opts[k] = argv[++i]; }
    } else args.push(a);
  }
  return { args, opts };
}

function openInBrowser(file, isUrl = false) {
  const target = isUrl ? file : path.resolve(file);
  const [cmd, ...pre] = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['cmd', '/c', 'start', ''] : ['xdg-open'];
  try { spawn(cmd, [...pre, target], { stdio: 'ignore', detached: true }).unref(); } catch { /* the path is printed anyway */ }
}

function report(result, focus) {
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  console.log(`Built ${path.relative(process.cwd(), result.file)} — ${result.designs.map(d => `${d.name} (${d.steps} step${d.steps === 1 ? '' : 's'})`).join(', ')}`);
  if (focus) console.log(`Open a step directly: ${path.relative(process.cwd(), result.file)}#${focus}`);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { args, opts } = parse(rest);
  const dir = opts.dir || 'designs';
  if (!cmd || ['help', '--help', '-h'].includes(cmd) || opts.help) return console.log(HELP);

  if (cmd === 'add') {
    if (!args[0]) throw new Error('Usage: designlapse add <final.html> --title "…" [--prompt "…"] [--frame phone]');
    if (opts.frame && !FRAMES.includes(opts.frame)) throw new Error(`--frame must be one of: ${FRAMES.join(', ')}`);
    const r = add(args[0], { dir, name: opts.name, title: opts.title, prompt: opts.prompt, frame: opts.frame, url: opts.url, force: opts.force });
    console.log(`Added "${r.name}" with ${r.steps} step${r.steps === 1 ? '' : 's'}${r.steps === 1 ? ' (tag pieces with data-step="1", "2", … to build it up in steps)' : ''}.`);
    const b = build({ dir, current: r.name });
    report(b, `${r.name}/step-${r.steps}`);
    if (opts.open) openInBrowser(b.file);
  } else if (cmd === 'iterate') {
    if (!args[0] || !args[1]) throw new Error('Usage: designlapse iterate <name> <step.html> [--from <step>]');
    const r = iterate(args[0], args[1], { dir, from: opts.from });
    console.log(`Added step ${r.id} to "${r.name}"${r.parent ? `, ${r.branch ? 'branching' : 'continuing'} from step ${r.parent}` : ''} (${path.relative(process.cwd(), r.file)}).`);
    const b = build({ dir, current: r.name });
    report(b, `${r.name}/step-${r.id}`);
    if (opts.open) openInBrowser(b.file);
  } else if (cmd === 'build') {
    const b = build({ dir, current: opts.name });
    report(b);
    if (opts.open) openInBrowser(b.file);
  } else if (cmd === 'dev') {
    const port = opts.port === undefined ? 4321 : Number(opts.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be a number');
    const d = dev({ dir, port, current: opts.name });
    d.server.on('error', e => { console.error(`designlapse: ${e.code === 'EADDRINUSE' ? `port ${port} is in use, try --port ${port + 1}` : e.message}`); process.exit(1); });
    if (opts.open) d.server.on('listening', () => openInBrowser(`http://localhost:${d.server.address().port}`, true));
    process.on('SIGINT', () => { d.close(); process.exit(0); });
  } else if (cmd === 'list') {
    const ds = list({ dir });
    if (!ds.length) return console.log(`No designs in ${dir} yet.`);
    for (const { name, data } of ds) {
      console.log(`${name} — ${data.title || name}${data.prompt ? ` (“${data.prompt}”)` : ''}`);
      for (const [i, s] of (data.steps || []).entries()) {
        const id = String(s.id ?? i + 1);
        console.log(`  step ${id}${s.parent && s.parent !== String(Number(id) - 1) ? ` (from ${s.parent})` : ''}: ${path.join(dir, s.file || '')}`);
      }
    }
  } else if (cmd === 'instructions') {
    process.stdout.write(fs.readFileSync(path.join(HERE, '..', 'AGENTS.md'), 'utf8'));
  } else {
    throw new Error(`Unknown command "${cmd}". Run \`designlapse --help\`.`);
  }
}

try { main(); } catch (e) { console.error(`designlapse: ${e.message}`); process.exit(1); }
