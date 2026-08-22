// Banco offline: riproduce il contesto n8n ($, $json, $input) attorno al codice di un nodo.
const fs = require('fs');
function runNode(codePath, ctx) {
  const code = fs.readFileSync(codePath, 'utf8');
  const wrap = (v) => ({ json: v });
  const $ = (nome) => {
    const v = ctx.nodes[nome];
    if (v === undefined) throw new Error('nodo assente nel banco: ' + nome);
    const arr = (Array.isArray(v) ? v : [v]).map(wrap);
    return { first: () => arr[0], all: () => arr, last: () => arr[arr.length - 1] };
  };
  const $json = ctx.json || {};
  const $input = { all: () => (ctx.input || []).map(wrap) };
  const fn = new Function('$', '$json', '$input', code + '\n');
  return fn($, $json, $input);
}
module.exports = { runNode };
