# Network Tuning And BBR

This feature adds a cautious network tuning workflow for Linux agents.

## Scope

- detect only mode before apply
- dry-run without system changes
- apply, rollback, and history
- audit trail with actor, action, agent, profile, before, after, result, error, and time
- only manages `/etc/sysctl.d/99-chiken-network.conf`

## Supported Actions

- `enable-bbr`
- `enable-bbr2`
- `set-cubic`
- `remove-chiken-tuning`
- `rollback`

## Detection Items

- distro
- kernel
- arch
- root availability
- current congestion control
- available congestion control algorithms
- current qdisc
- support for `bbr`, `bbr2`, and `fq`
- whether `/etc/sysctl.d/99-chiken-network.conf` exists

## Safety Model

- no arbitrary shell from the frontend
- backup before apply
- clear unsupported results for risky or unavailable paths
- rollback support
- no changes to sshd, firewall, route table, or unknown kernels

## Operational Guidance

- do not enable BBR in bulk by default
- test one non-critical agent first
- compare before and after with proxy-check, latency, loss, and throughput
- BBR does not guarantee faster results across all mainland China carriers

## Cache Note

If the admin page looks stuck after deployment, first try `Ctrl+F5` or clear site cache. `index.html` should be treated as `no-cache`, while built JS and CSS should continue to use hashed asset names after production build.
