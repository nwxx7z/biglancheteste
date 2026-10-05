# BIG LANCHE — pedidos + cozinha (Vercel + Neon)

Esta versão mantém o teste local com `node server.js` e também pode ser publicada no Vercel.

## Novidade: observação por item
No carrinho, cada produto agora tem seu próprio campo de observação. Ex.: `sem salada`, `sem bacon`, `sem tomate`. Essa observação aparece no painel da cozinha, na impressão e na mensagem do WhatsApp.

## Publicar no Vercel
1. Suba esta pasta para um repositório do GitHub ou importe a pasta diretamente no Vercel.
2. No projeto Vercel, adicione uma integração **Neon** em Storage/Marketplace.
3. Abra o SQL Editor do banco e execute `db/schema.sql`.
4. Confirme que o projeto possui a variável de ambiente `DATABASE_URL` apontando para o Neon.
5. Faça um novo deploy.

Depois, o mesmo domínio terá:
- `/` → cardápio do cliente
- `/cozinha` → painel da cozinha
- `/api/orders` → API dos pedidos

## Teste local
1. Node.js 18+
2. `npm install`
3. `node server.js`
4. Abra `http://localhost:3000/` e `http://localhost:3000/cozinha`

No local, os pedidos continuam sendo gravados em `data/orders.json`. No Vercel, os pedidos são gravados no Neon.

## Impressora
O painel continua usando QZ Tray no computador da cozinha. O Vercel/Neon cuidam do site e dos pedidos; o acesso à impressora continua sendo local pelo QZ Tray.

## Observação de produção
Este modelo ainda não tem autenticação do painel da cozinha. Para um teste com cliente, ele está estruturado para funcionar; para uso comercial real, vale adicionar autenticação, regras de acesso e assinatura/configuração adequada do QZ Tray.
