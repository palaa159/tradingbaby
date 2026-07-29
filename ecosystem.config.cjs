/**
 * pm2 process definition — publishes the maker dashboard at https://alpha.5lab.co
 *
 *   pm2 start ecosystem.config.cjs && pm2 save
 *
 * Cloudflare proxies alpha.5lab.co to this host on :443 in "Full" SSL mode, so
 * the origin certificate is self-signed and never validated by Cloudflare.
 */
module.exports = {
  apps: [
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
