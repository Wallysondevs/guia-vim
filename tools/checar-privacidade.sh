#!/usr/bin/env bash
# Varre as páginas (versão atual) e todo o histórico do git atrás de strings proibidas.
#
# Uso:
#   PROIBIDO=/caminho/da/lista.txt tools/checar-privacidade.sh
#   tools/checar-privacidade.sh --revisar   # também lista MACs, UUIDs e IPs para conferir à mão
#
# A lista real (nome, usuário, pastas, nome e IPs da máquina) fica FORA do repositório,
# num arquivo apontado por PROIBIDO (padrão: ../.proibido-linux.txt). Uma entrada por linha;
# linhas vazias e começadas com # são ignoradas; "re:" no começo = expressão regular (grep -P).
# A busca não diferencia maiúsculas.
#
# Além da lista, sempre entram padrões genéricos (sem nenhum valor real):
# chave privada, token do GitHub, nome padrão de PC Windows (DESKTOP- e mais 7 letras ou números),
# C:\Users\<nome> que não seja ana/Public/Default e SID de máquina Windows.
#
# Liberado (público ou igual em toda máquina): o usuário público do GitHub (wallysondevs,
# usado nos links do site e no autor dos commits) e 172.17.0.1, o gateway padrão do Docker.
set -u
cd "$(dirname "$0")/.."
LISTA="${PROIBIDO:-../.proibido-linux.txt}"
REVISAR=0; [ "${1:-}" = "--revisar" ] && REVISAR=1

padroes=()
padroes+=("re:-----BEGIN [A-Z ]*PRIVATE KEY-----")
padroes+=("re:\\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}")
padroes+=("re:\\bDESKTOP-[A-Z0-9]{7}\\b")
padroes+=("re:C:\\\\Users\\\\(?!ana\\b|Public\\b|Default\\b)[^\\\\\\s/<>\"]+")
padroes+=("re:S-1-5-21-\\d+-\\d+-\\d+")

if [ -f "$LISTA" ]; then
  echo "Usando a lista $LISTA (além dos padrões embutidos)."
  while IFS= read -r linha || [ -n "$linha" ]; do
    [[ -z "$linha" || "$linha" == \#* ]] && continue
    padroes+=("$linha")
  done < "$LISTA"
else
  echo "AVISO: lista $LISTA não encontrada; usando só os padrões embutidos."
  echo "       Defina PROIBIDO=/caminho/da/lista.txt (fora do repositório)."
fi

# tira do texto o que é liberado antes de procurar
liberar() { perl -pe 's/wallysondevs//gi; s/(?<![\d.])172\.17\.0\.1(?![\d.])//g'; }

atual=$(mktemp); hist=$(mktemp); trap 'rm -f "$atual" "$hist"' EXIT
grep -rnI --exclude-dir=.git "" . | liberar > "$atual"
git log --all -p --format='commit %H%nAutor: %an <%ae>%n%n%B' 2>/dev/null | liberar > "$hist"

falhou=0
for pad0 in "${padroes[@]}"; do
  if [[ "$pad0" == re:* ]]; then pad="${pad0#re:}"; opt=(-P -i); else pad="$pad0"; opt=(-F -i); fi
  achou=$(grep "${opt[@]}" -e "$pad" "$atual" | cut -c1-200 | head -5)
  nh=$(grep -c "${opt[@]}" -e "$pad" "$hist")
  if [ -n "$achou" ] || [ "$nh" != "0" ]; then
    falhou=1
    echo "FALHA: $pad (linhas no histórico: $nh)"
    [ -n "$achou" ] && echo "$achou" | sed 's/^/  atual: /'
    [ -z "$achou" ] && echo "  (só no histórico; a versão atual está limpa)"
  fi
done

if [ $REVISAR = 1 ]; then
  echo
  echo "Para conferir à mão (não reprova): MACs, UUIDs e IPv4 fora das faixas de exemplo."
  grep -oPi '\b([0-9a-f]{2}:){5}[0-9a-f]{2}\b' "$atual" | sort | uniq -c | sort -rn | sed 's/^/  MAC  /'
  grep -oPi '\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b' "$atual" | sort | uniq -c | sort -rn | sed 's/^/  UUID /'
  grep -oP '(?<![\d.])(?!192\.168\.0\.|127\.|0\.0\.0\.0|255\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|8\.8\.|1\.1\.1\.1)(?:\d{1,3}\.){3}\d{1,3}(?![\d.])' "$atual" | sort | uniq -c | sort -rn | sed 's/^/  IP   /'
fi

[ $falhou = 0 ] && echo "OK: nenhuma string proibida nas páginas nem no histórico."
exit $falhou
