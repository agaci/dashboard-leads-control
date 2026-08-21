Aqui está o algoritmo completo. Vive todo em statisticFunction.js, nas linhas 29-94 (o cálculo) e 126-310 (o agrupamento).

As cinco variáveis
campo no ecrã	chave	no teu print
Percentual de Comissão	commissionPercentage	0.05
Percentual de Lucro de Referência	referenceProfitPercentage	50
Modelo de Cálculo da Comissão	commissionModel	fixed
Base de Cálculo da Margem	commissionMarginBase	cost
Modelo de Margem Aplica-se a Partir de	commissionModelStartMonth	vazio
Atenção a uma armadilha nestes dois primeiros campos. A função toRate aceita as duas convenções que convivem na base de dados:


return n > 1 ? n / 100 : n;     // 5 e 0.05 dão ambos 5%
Portanto 0.05 é lido como 5% e 50 como 50%. Mas isto significa que 1 seria lido como 100%, e não como 1% — o valor 1 é o ponto cego desta regra. Se alguém escrever 1 no percentual de comissão, passa a pagar o preço de venda inteiro.

Passo 1 — o modelo aplica-se a este mês?

usarMargem = (commissionModel === 'margin')
             E (startMonth vazio  OU  ano/mês pedido >= startMonth)
O mês de início trava a retroatividade. O relatório recalcula sempre a partir do histórico, e sem esta trava mudar a definição hoje reescreveria comissões de meses já fechados e pagos.

Passo 2 — agrupar serviços ligados (só no modelo de margem)
Um serviço composto — Lisboa→Porto entregue via parceiro — é lançado como vários: o principal leva o preço de venda, as pernas levam só o custo do estafeta com price = 0. A ligação está no usersClient.clientKey, onde as pernas guardam o nr do principal.

Serviço a serviço a margem não significa nada: o principal aparenta margem enorme e as pernas margem nula. Só somando o grupo:


margem do grupo = (Σ price − Σ driverPrice) / Σ driverPrice
O principal é o de maior price, e o grupo conta todo no mês dele. Há duas guardas: a ligação só é aceite se existir mesmo um serviço com esse nr e for do mesmo clientName — porque o clientKey é texto livre e referências como 19_CAT_937032126 extraem números que casam com serviços antigos de outros clientes.

Passo 3 — a margem

base 'cost'     margem = (price − driverPrice) / driverPrice     ← markup sobre o custo
base 'revenue'  margem = (price − driverPrice) / price           ← margem sobre a venda
Passo 4 — a comissão

fixo = price × rate

se não usarMargem            → comissão = fixo
se referenceMargin <= 0      → comissão = fixo
se margem não calculável     → comissão = fixo          (sem custo de estafeta)
se margem <= 0               → comissão = 0
senão:
    taxa     = min( rate × (margem / referenceMargin), rate )
    comissão = price × taxa
O min é o tecto: margem acima da referência nunca paga mais do que o modelo fixo pagaria. A redução só funciona num sentido.

Exemplo, com os teus valores
Serviço de €100, custo de estafeta €70, comissão 5%, referência 50%:

base	margem	taxa aplicada	comissão
custo	30/70 = 42,9%	5% × (42,9/50) = 4,29%	€4,29
venda	30/100 = 30,0%	5% × (30/50) = 3,00%	€3,00
modelo fixo	—	5%	€5,00
A escolha da base muda o resultado em quase um terço. As duas medem coisas diferentes e não se comparam com a mesma referência de 50%.

O que está ligado hoje
Pelo teu print, commissionModel = fixed. Ou seja, tudo isto reduz-se a comissão = price × 5% — nada do modelo de margem está a correr em produção.

Antes de ligar existe o método compareCommissionModels, que corre os dois modelos sobre o mesmo mês e devolve o delta por comissionista, sem depender das definições. Serve exactamente para calibrar a referência antes de mudar.

E fica a nota que já tínhamos registado: falta a mudança de procedimento no clientName dos serviços auxiliares — é dela que depende o agrupamento funcionar — e definir o commissionModelStartMonth. Sem a primeira, os serviços compostos ficam com margens falsas nos dois sentidos.