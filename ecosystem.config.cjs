/**
 * pm2 process definitions — the school and the window onto it.
 *
 *   pm2 start ecosystem.config.cjs && pm2 save
 *
 * `alpha-daemon` rings the bells and runs the students' cycles; the box itself
 * is on UTC, so the daemon is pinned to Asia/Bangkok — the waking window in
 * the spec is the maker's morning, not Greenwich's.
 *
 * `alpha-trader` runs the adopted strategies on the candle clock. It is a
 * separate process on purpose: thinking is rationed by the subscription quota,
 * trading costs no AI at all, so a student out of energy keeps earning.
 *
 * `alpha-dashboard` publishes at https://alpha.5lab.co. Cloudflare proxies the
 * hostname to this host on :443 in "Full" SSL mode, so the origin certificate
 * is self-signed and never validated by Cloudflare.
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
      // Run bun as a plain binary: pm2's bun interpreter wrapper uses require(),
      // which rejects this module for its top-level await.
      script: '/usr/local/bin/bun',
      interpreter: 'none',
      args: [
        'src/server/dashboard/server.ts',
        '--port=443',
        '--db=/root/tradingbaby/academy.db',
        '--tls-cert=/etc/alpha-academy/origin.crt',
        '--tls-key=/etc/alpha-academy/origin.key',
      ],
      autorestart: true,
      restart_delay: 5000,
      out_file: '/var/log/alpha-dashboard.log',
      error_file: '/var/log/alpha-dashboard.log',
    },
  ],
};
