import React from 'react';
import AppShell from './AppShell';
import NetworkView from './components/NetworkView';
import FinancialView from './components/FinancialView';
import TelecomView from './components/TelecomView';
import DossierView from './components/DossierView';
import { useStore } from './store';

export default function App() {
  const { activeModule } = useStore();

  return (
    <AppShell>
      {activeModule === 'network' && <NetworkView />}
      {activeModule === 'finance' && <FinancialView />}
      {activeModule === 'telecom' && <TelecomView />}
      {activeModule === 'dossier' && <DossierView />}
    </AppShell>
  );
}