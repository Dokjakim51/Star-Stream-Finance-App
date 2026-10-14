"""Verificaciones estáticas de la distribución pública de Star Stream.

No intenta conectarse a Google Drive ni ejecutar Apps Script.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class IDParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids: list[str] = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name == 'id' and value:
                self.ids.append(value)


def comprobar(condicion, mensaje):
    if not condicion:
        raise AssertionError(mensaje)
    print('[OK]', mensaje)


def comprobar_sintaxis_node(ruta: Path, contenido: str):
    with tempfile.TemporaryDirectory() as tmp:
        temporal = Path(tmp) / 'comprobar.js'
        temporal.write_text(contenido, encoding='utf-8')
        res = subprocess.run(['node', '--check', str(temporal)], capture_output=True, text=True)
        comprobar(res.returncode == 0, f'Sintaxis JavaScript válida: {ruta.name}' + (' (' + res.stderr.strip() + ')' if res.returncode else ''))


def main():
    requeridos = ['Code.gs', 'Database.gs', 'DataTools.gs', 'Accounts.gs', 'Analytics.gs',
                  'Categories.gs', 'Dashboard.gs', 'Goals.gs', 'Planning.gs',
                  'Receipts.gs', 'Transactions.gs', 'Transfers.gs', 'Utils.gs',
                  'index.html', 'styles.html', 'scripts.html', 'appsscript.json',
                  'README.md', '.gitignore']
    comprobar(all((RAIZ / f).is_file() for f in requeridos), 'Archivos esenciales presentes')

    manifest = json.loads((RAIZ / 'appsscript.json').read_text(encoding='utf-8'))
    comprobar(manifest.get('runtimeVersion') == 'V8', 'Manifiesto Google Apps Script válido (V8)')

    index = (RAIZ / 'index.html').read_text(encoding='utf-8')
    scripts = (RAIZ / 'scripts.html').read_text(encoding='utf-8')
    styles = (RAIZ / 'styles.html').read_text(encoding='utf-8')
    full = index + '\n' + scripts + '\n' + styles
    for removed in ['STARLOCK_PASSWORD', 'starLockScreen', 'starLockPassword', 'starLockForm',
                    'lockButton', 'lock-now', 'starlock-', 'ss-lock-active', 'initLockScreen']:
        comprobar(removed not in full, 'Componente de bloqueo ausente: ' + removed)

    parser = IDParser()
    parser.feed(index)
    duplicados = sorted({i for i in parser.ids if parser.ids.count(i) > 1})
    comprobar(not duplicados, f'IDs de HTML sin duplicados: {duplicados}')
    comprobar(index.count("<?!= include('styles'); ?>") == 1 and index.count("<?!= include('scripts'); ?>") == 1,
              'Includes de Apps Script presentes')
    comprobar(scripts.lstrip().startswith('<script>') and scripts.rstrip().endswith('</script>'),
              'JavaScript del cliente encapsulado correctamente')
    comprobar(styles.lstrip().startswith('<style>') and styles.rstrip().endswith('</style>'),
              'CSS encapsulado correctamente')

    backend = '\n'.join(p.read_text(encoding='utf-8') for p in RAIZ.glob('*.gs'))
    funcs = set(re.findall(r'^function\s+(\w+)\s*\(', backend, re.M))
    calls = set(re.findall(r'\bcall\(\s*[\'"](\w+)[\'"]', scripts))
    calls.update(re.findall(r'\bplanningActionFase6\(\s*[\'"](\w+)[\'"]', scripts))
    faltantes = sorted(calls - funcs)
    comprobar(not faltantes, 'Llamadas cliente → servidor resueltas: ' + str(len(calls)) + (' faltan ' + str(faltantes) if faltantes else ''))
    comprobar({'instalarStarStream', 'migrarStarStreamFase8', 'restablecerDatosFinancierosFase8'}.issubset(funcs),
              'Instalación, migración y restablecimiento definidos')

    ignorados = (RAIZ / '.gitignore').read_text(encoding='utf-8')
    comprobar('.clasp.json' in ignorados and 'backups/' in ignorados, 'Exclusión de datos privados configurada')
    privados = [str(p.relative_to(RAIZ)) for p in RAIZ.rglob('*') if p.is_file() and
               (p.name in ('.clasp.json', '.clasprc.json') or p.suffix.lower() in ('.csv', '.jpg', '.jpeg', '.png', '.pdf'))]
    comprobar(not privados, 'No hay fotografías, extractos ni credenciales en el proyecto: ' + str(privados))

    if shutil.which('node'):
        comprobador = re.sub(r'^\s*<script>\s*', '', scripts)
        comprobador = re.sub(r'\s*</script>\s*$', '', comprobador)
        comprobar_sintaxis_node(RAIZ / 'scripts.html', comprobador)
        for archivo in sorted(RAIZ.glob('*.gs')):
            comprobar_sintaxis_node(archivo, archivo.read_text(encoding='utf-8'))
    else:
        print('[AVISO] Node.js no instalado: se omite la validación de sintaxis JavaScript.')

    print('\nValidación estática aprobada. Falta comprobar la aplicación desde Google Apps Script.')


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, ValueError, OSError) as err:
        print('[ERROR]', err, file=sys.stderr)
        sys.exit(1)
