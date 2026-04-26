# Deploy — leads.comgo.pt

## Servidor
- Ubuntu + WSL + Docker
- Shell: `helder@DESKTOP-S180VP5`
- Repo no servidor: `~/dashboard-leads-control` (branch `main`)
- App em: `https://leads.comgo.pt/dashboard`

## Arquitectura
- App: container Docker `yourbox-leads` na porta `3006`
- Reverse proxy: `nginx-proxy-manager` (container) na rede `yourbox-network`
- O nginx resolve o upstream pelo nome do container — ambos têm de estar na rede `yourbox-network`

## Deploy normal (após push)

```bash
cd ~/dashboard-leads-control && git pull && docker compose build --no-cache && docker compose up -d
```

## Primeira vez / container não existe

```bash
cd ~/dashboard-leads-control
git pull
docker compose build --no-cache
docker stop yourbox-leads 2>/dev/null; docker rm yourbox-leads 2>/dev/null
docker compose up -d
docker network connect yourbox-network yourbox-leads
docker exec nginx-proxy-manager nginx -s reload
```

## Se a porta 3006 estiver ocupada

```bash
docker ps | grep 3006          # identificar o container
docker stop <nome> && docker rm <nome>
```

## Verificar se está tudo bem

```bash
docker ps | grep yourbox-leads                        # deve mostrar 0.0.0.0:3006->3006/tcp
docker logs yourbox-leads --tail 20                   # deve mostrar "Ready in Xms"
curl -I http://localhost:3006                          # deve responder 307 ou 200
```

## Notas importantes

- O `.env.local` **não está no git** — tem de existir manualmente em `~/dashboard-leads-control/.env.local`
- O container **tem de se chamar `yourbox-leads`** — o nginx está configurado com esse nome
- O container **tem de estar na rede `yourbox-network`** — o `docker compose up` liga-o à rede `bridge` por defeito; o `docker network connect` corrige isso
- O `docker compose up -d` já trata do stop/start do container existente em deploys normais

## Push do local para o servidor

No Windows (PowerShell ou bash):
```bash
git push origin master:main
```
