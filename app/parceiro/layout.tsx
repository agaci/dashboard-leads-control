import type { Metadata } from 'next';

// O portal do parceiro tem identidade própria: é a YourBox que o parceiro representa,
// não o dashboard interno de leads.
export const metadata: Metadata = {
  title: 'YourBox · Portal de parceiro',
  description: 'Actividade do seu widget YourBox e comissões',
};

export default function ParceiroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
