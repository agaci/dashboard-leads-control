/**
 * Os textos com que se pede autorização ao cliente.
 *
 * O RGPD exige que se consiga DEMONSTRAR o consentimento. Demonstrar não é dizer "ela
 * autorizou" — é conseguir mostrar o que a pessoa leu ou ouviu antes de dizer que sim.
 * Por isso o texto é fixo, versionado, e fica copiado dentro de cada autorização: mudar
 * a redacção aqui não pode reescrever o passado, porque as autorizações antigas apontam
 * para o texto que os clientes daquela altura viram.
 *
 * Há dois porque há dois canais, e não se lê ao telefone o que se escreve num email. O
 * conteúdo é deliberadamente o mesmo — o que muda é a pessoa gramatical e o facto de o
 * segundo estar escrito. Se um dia divergirem no que dizem, deixa de haver um só
 * consentimento e passam a existir dois, com valor legal diferente.
 *
 * Sem imports de runtime, para poder ser testado sem base de dados.
 */

export interface Guiao {
  versao: string;
  texto: string;
}

/**
 * Lido pela gerente de conta na chamada. Fixo de propósito: se cada uma disser à sua
 * maneira, não há forma de demonstrar o que foi dito.
 */
export const GUIAO_CONSENTIMENTO: Guiao = {
  versao: 'v1',
  texto:
    'Este transporte não é dos que fazemos. Temos empresas especializadas que o fazem — '
    + 'quer que lhes passemos o seu pedido, com o seu contacto, para lhe apresentarem uma proposta? '
    + 'A YourBox deixa de tratar deste serviço a partir daí.',
};

/**
 * Mostrado no email de autorização e outra vez na página onde a pessoa decide.
 *
 * Repetido nos dois sítios de propósito: quem clica num botão de um email a partir do
 * telemóvel muitas vezes já não tem o email à frente. A decisão tem de ser tomada com o
 * texto à vista, não de memória.
 */
export const GUIAO_AUTORIZACAO_EMAIL: Guiao = {
  versao: 'email-v1',
  texto:
    'Este transporte não é dos que fazemos. Temos empresas especializadas que o fazem — '
    + 'autoriza que lhes passemos o seu pedido, com o seu nome e contacto, para lhe '
    + 'apresentarem uma proposta? A YourBox deixa de tratar deste serviço a partir daí.',
};
