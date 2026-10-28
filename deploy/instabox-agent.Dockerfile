FROM chiken-test-instabox:current
RUN apk add --no-cache openssh-server \
    && ssh-keygen -A \
    && adduser -D -u 1001 -h /workspace operator \
    && passwd -u operator \
    && mkdir -p /etc/chiken
COPY deploy/instabox-sshd_config /etc/chiken/sshd_config
