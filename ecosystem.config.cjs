/**
 * pm2 process definitions — the school and the window onto it.
 *
 *   pm2 start ecosystem.config.cjs && pm2 save
 *
 * `alpha-daemon` rings the bells and runs the students' cycles; the box itself
 * is on UTC, so the daemon is pinned to Asia/Bangkok — the waking window in
 * the spec is the maker's morning, not Greenwich's.
 *
 * `alpha-principal` walks the school every 15 minutes and writes each round to
 * principal_rounds, so the maker reads the school's health on the dashboard
 * instead of having to be at a terminal when a round happens. It still writes
 * no code — auto-merge stays off until the maker turns it on (spec §9.4).
 *
 * `alpha-designer` looks at the real screen every three hours and fixes what it
 * can inside the green zone. It had never been scheduled at all: it ran once, by
 * hand, crashed, and nothing brought it back — which is most of the reason the
 * screen stopped improving. A round it keeps goes onto a branch of its own and
 * is pushed; `main` is never written to. It walks four pages per round on a
 * rotating window and gives up after twelve minutes — all nine pages at both
 * viewports was a critique of eighteen screenshots, which it never once
 * finished.
 *
 * `alpha-trader` runs the adopted strategies on the candle clock. It is a
 * separate process on purpose: thinking is rationed by the subscription quota,
 * trading costs no AI at all, so a student out of energy keeps earning.
 *
 * `alpha-dashboard` is the Next.js app, listening on loopback :4173. Caddy
 * terminates TLS on :443 with the self-signed origin certificate and proxies to
 * it — Cloudflare is in "Full" mode, which encrypts to the origin without
 * validating the certificate. Caddy runs under systemd, not pm2.
 *
 * Both open the same academy.db. SQLite is in WAL mode, so the dashboard reads
 * while the daemon writes.
 */
module.exports = {
  apps: [
    {
      name: 'alpha-daemon',
      cwd: '/root/tradingbaby',
      script: '/usr/local/bin/bun',
      interpreter: 'none',
      args: ['src/server/daemon.ts', '--db=/root/tradingbaby/academy.db'],
      env: { TZ: 'Asia/Bangkok' },
      autorestart: true,
      restart_delay: 10000,
      out_file: '/var/log/alpha-daemon.log',
      error_file: '/var/log/alpha-daemon.log',
    },
    {
      name: 'alpha-principal',
      cwd: '/root/tradingbaby',
      script: '/usr/local/bin/bun',
      interpreter: 'none',
      args: ['src/server/principal.ts', '--db=/root/tradingbaby/academy.db', '--watch=15'],
      env: { TZ: 'Asia/Bangkok' },
      autorestart: true,
      restart_delay: 10000,
      out_file: '/var/log/alpha-principal.log',
      error_file: '/var/log/alpha-principal.log',
    },
    {
      name: 'alpha-designer',
      cwd: '/root/tradingbaby',
      script: '/usr/local/bin/bun',
      interpreter: 'none',
      args: ['src/server/designer.ts', '--db=/root/tradingbaby/academy.db', '--watch=180'],
      env: { TZ: 'Asia/Bangkok' },
      autorestart: true,
      restart_delay: 60000,
      out_file: '/var/log/alpha-designer.log',
      error_file: '/var/log/alpha-designer.log',
    },
    {
      name: 'alpha-trader',
      cwd: '/root/tradingbaby',
      script: '/usr/local/bin/bun',
      interpreter: 'none',
      args: ['src/server/trader.ts', '--db=/root/tradingbaby/academy.db'],
      env: { TZ: 'Asia/Bangkok' },
      autorestart: true,
      restart_delay: 10000,
      out_file: '/var/log/alpha-trader.log',
      error_file: '/var/log/alpha-trader.log',
    },
    {
      name: 'alpha-dashboard',
      cwd: '/root/tradingbaby',
      // Next.js runs under Bun, not Node: every store imports `bun:sqlite`.
      // Caddy holds :443 and proxies here, because Next has no TLS listener.
      script: '/usr/local/bin/bun',
      interpreter: 'none',
      args: ['./node_modules/.bin/next', 'start', '-p', '4173'],
      env: {
        TZ: 'Asia/Bangkok',
        ACADEMY_DB: '/root/tradingbaby/academy.db',
        NODE_ENV: 'production',
      },
      autorestart: true,
      restart_delay: 5000,
      out_file: '/var/log/alpha-dashboard.log',
      error_file: '/var/log/alpha-dashboard.log',
    },
  ],
};
