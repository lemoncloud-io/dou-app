#!/usr/bin/env bash
# Measure Tauri vs Electron desktop shells: bundle size, cold start, idle memory, idle CPU.
# Usage: bench-desktop.sh [--dry-run] [--runs N] [--idle SECS] [--settle SECS] [--only tauri|electron]
#        [--tauri-app PATH] [--electron-app PATH] [--out DIR]
# Each run uses a copy of the bundle, an empty HOME and an empty TMPDIR, so it never touches a running
# app, a signed-in profile or the single-instance socket of the apps already open. Nothing is signed in.
set -euo pipefail

RUNS=5
IDLE=60
SETTLE=20
ONLY=""
DRY=0
TAURI_APP="${DOU_BENCH_TAURI_APP:-}"
ELECTRON_APP="${DOU_BENCH_ELECTRON_APP:-/Applications/DoU Dev.app}"
OUT="${DOU_BENCH_OUT:-/tmp/dou-desktop-bench}"

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY=1 ;;
        --runs) RUNS="$2"; shift ;;
        --idle) IDLE="$2"; shift ;;
        --settle) SETTLE="$2"; shift ;;
        --only) ONLY="$2"; shift ;;
        --tauri-app) TAURI_APP="$2"; shift ;;
        --electron-app) ELECTRON_APP="$2"; shift ;;
        --out) OUT="$2"; shift ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run() {
    if [ "$DRY" = 1 ]; then
        printf '+ %s\n' "$*"
    else
        "$@"
    fi
}

now_ms() { perl -MTime::HiRes=time -e 'printf "%d", time*1000'; }

tree_pids() {
    ps -axo pid=,ppid= | awk -v root="$1" '
        { kids[$2] = kids[$2] " " $1 }
        END { n = 1; q[1] = root; print root
              for (i = 1; i <= n; i++) { m = split(kids[q[i]], a, " "); for (j = 1; j <= m; j++) { q[++n] = a[j]; print a[j] } } }'
}

webkit_pids() { ps -axo pid=,comm= | awk '/com\.apple\.WebKit\.(WebContent|Networking|GPU)/ { print $1 }' | sort; }

footprint_mb() {
    local pid="$1"
    footprint -p "$pid" 2>/dev/null | awk '/Footprint:/ {
        v = $(NF-5); u = $(NF-4); if (u == "KB") v /= 1024; else if (u == "GB") v *= 1024; else if (u == "B") v /= 1048576
        printf "%.1f", v; exit }'
}

cpu_seconds() {
    local total=0 t pid
    for pid in "$@"; do
        t=$(ps -o time= -p "$pid" 2>/dev/null | tr -d ' ' || true)
        [ -z "$t" ] && continue
        total=$(awk -v a="$total" -v t="$t" 'BEGIN { n = split(t, p, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + p[i]; printf "%.2f", a + s }')
    done
    echo "$total"
}

median() { sort -n | awk '{ v[NR] = $1 } END { if (NR == 0) print "n/a"; else if (NR % 2) print v[(NR + 1) / 2]; else printf "%.1f\n", (v[NR / 2] + v[NR / 2 + 1]) / 2 }'; }

size_mb() { du -sk "$1" | awk '{ printf "%.1f", $1 / 1024 }'; }

measure() {
    local label="$1" app="$2" exe="$3"
    local dir="$OUT/$label"
    run mkdir -p "$dir"
    echo "== $label: $app"
    if [ "$DRY" = 0 ] && [ ! -d "$app" ]; then echo "missing app bundle: $app" >&2; return 1; fi
    echo "bundle_mb $(if [ "$DRY" = 1 ]; then echo '<du -sk>'; else size_mb "$app"; fi)"

    local i
    run rm -f "$dir/start_ms.txt"
    for i in $(seq 1 "$RUNS"); do
        local work="$dir/run$i"
        run rm -rf "$work"
        run mkdir -p "$work/home" "$work/tmp"
        run ditto "$app" "$work/App.app"
        if [ "$label" = tauri ]; then
            run perl -pi -e 's/io\.chatic\.desktop\.tauri/io.chatic.desktop.taurb/g' "$work/App.app/Contents/MacOS/dou-tauri" "$work/App.app/Contents/Info.plist"
            run codesign --force --deep -s - "$work/App.app"
        fi
        if [ "$DRY" = 1 ]; then
            echo "+ HOME=$work/home CFFIXED_USER_HOME=$work/home TMPDIR=$work/tmp $work/App.app/Contents/MacOS/$exe & ; $OUT/win <pid> 30 (first on-screen window)"
            continue
        fi
        local before after pid t0 t1 pids web eng_pids=""
        before="$(webkit_pids)"
        t0=$(now_ms)
        HOME="$work/home" CFFIXED_USER_HOME="$work/home" TMPDIR="$work/tmp" "$work/App.app/Contents/MacOS/$exe" >"$work/stdout.log" 2>&1 &
        pid=$!
        disown "$pid"
        t1=$("$OUT/win" "$pid" 30 | tail -1 || true)
        if ! [[ "$t1" =~ ^[0-9]+$ ]]; then echo "run$i start_ms timeout"; kill "$pid" 2>/dev/null || true; continue; fi
        echo "$((t1 - t0))" >>"$dir/start_ms.txt"
        echo "run$i start_ms $((t1 - t0))"
        if [ "$i" = "$RUNS" ]; then
            sleep "$SETTLE"
            after="$(webkit_pids)"
            web="$(comm -13 <(echo "$before") <(echo "$after") | tr '\n' ' ')"
            pids="$(tree_pids "$pid" | tr '\n' ' ') $web"
            local total=0 eng=0 p cmd fp
            : >"$dir/processes.txt"
            for p in $pids; do
                cmd=$(ps -o comm= -p "$p" 2>/dev/null | sed 's|.*/||' || true)
                [ -z "$cmd" ] && continue
                fp=$(footprint_mb "$p"); [ -z "$fp" ] && continue
                printf '%s\t%s\t%s\n' "$p" "$cmd" "$fp" >>"$dir/processes.txt"
                case "$cmd" in
                    dou-mcp|*engine*) eng=$(awk -v a="$eng" -v b="$fp" 'BEGIN { printf "%.1f", a + b }') ;;
                    *) total=$(awk -v a="$total" -v b="$fp" 'BEGIN { printf "%.1f", a + b }') ;;
                esac
            done
            echo "idle_mem_mb $total (processes: $(wc -l <"$dir/processes.txt" | tr -d ' '))"
            echo "engine_mem_mb $eng"
            local c0 c1 pl="$pids"
            c0=$(cpu_seconds $pl); sleep "$IDLE"; c1=$(cpu_seconds $pl)
            echo "idle_cpu_pct $(awk -v a="$c0" -v b="$c1" -v s="$IDLE" 'BEGIN { printf "%.2f", (b - a) / s * 100 }')"
            echo "profile_mb $(size_mb "$work/home")"
        fi
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
        sleep 2
    done
    if [ "$DRY" = 0 ] && [ -f "$dir/start_ms.txt" ]; then echo "start_ms_median $(median <"$dir/start_ms.txt") (runs: $(wc -l <"$dir/start_ms.txt" | tr -d ' '))"; fi
}

handlers() { local s; for s in chatic chatic-dev; do echo "$s=$("$OUT/win" scheme "$s")"; done; }

run mkdir -p "$OUT"
if [ "$DRY" = 1 ]; then
    echo "+ swiftc -O $HERE/bench-window.swift -o $OUT/win"
else
    swiftc -O "$HERE/bench-window.swift" -o "$OUT/win"
    HANDLERS_BEFORE="$(handlers)"
fi

[ "$ONLY" != electron ] && { [ -n "$TAURI_APP" ] || [ "$DRY" = 1 ] || { echo "set --tauri-app or DOU_BENCH_TAURI_APP" >&2; exit 2; }; measure tauri "${TAURI_APP:-<tauri-app>}" dou-tauri; }
[ "$ONLY" != tauri ] && measure electron "$ELECTRON_APP" "$(basename "$ELECTRON_APP" .app)"
if [ "$DRY" = 0 ] && [ "$HANDLERS_BEFORE" != "$(handlers)" ]; then
    echo "WARNING: a launched app changed the default handler of a URL scheme (macOS LaunchServices):" >&2
    echo "before: $HANDLERS_BEFORE" >&2
    echo "after:  $(handlers)" >&2
fi
echo "done; raw files under $OUT"
