import React from "react";

export default function Tutorial() {
  const cards = [
    ["节点配置", "切换协议时表单会自动更新为该协议的字段与默认值，不再保留上一种协议的残留参数。"],
    ["订阅聚合", "可以把已经下发过的本地节点聚合成订阅链接，也能直接导入外部原始内容，并切换内置 Clash 模板。"],
    ["真实 SSH", "服务器列表右侧现在有 SSH 入口。保存好该机器的 SSH 配置后，点一下就会直接进入交互式 WebSSH 终端。"],
    ["一键部署", "SSH 页面可以直接生成 systemd 或 Docker 的一键部署命令，也可以复用当前 SSH 凭据直接执行部署。"],
    ["实时探针", "Agent 会持续上报 CPU、内存、磁盘、网络速率和累计流量，效果更接近 Komari / 哪吒这类监控面板。"],
    ["独立转发", "端口转发支持 sing-box、Realm、GOST 三种引擎，并且通过独立容器运行，不再覆盖节点配置。"],
    ["TLS 自动补齐", "Trojan 和 Hysteria2 首次下发时会自动生成自签名证书，先把服务端跑起来，再做客户端验证。"],
    ["API Token", "把 token 放进地址栏 `?token=ck_xxx` 或面板顶部，即可让 API、日志和终端请求都自动带认证。"]
  ];

  return (
    <section>
      <div className="guide-grid">
        {cards.map(([title, body]) => (
          <div className="guide-card" key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
