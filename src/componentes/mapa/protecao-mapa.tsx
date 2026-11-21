'use client';
import { Component, type ReactNode } from 'react';

/** Se o mapa falhar (WebGL, worker, dados), a página continua: mostra um aviso no lugar dele. */
export class ProtecaoMapa extends Component<{ children: ReactNode }, { erro: boolean }> {
  override state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  override componentDidCatch(e: unknown) {
    console.error('Falha no mapa', e);
  }
  override render() {
    if (this.state.erro)
      return (
        <div role="status" className="grid h-[380px] place-items-center rounded-xl border border-linha bg-superficie-2 p-6 text-center text-[13.5px] text-tinta-2">
          Não foi possível exibir o mapa neste aparelho. Os talhões e as áreas continuam disponíveis na tabela.
        </div>
      );
    return this.props.children;
  }
}
