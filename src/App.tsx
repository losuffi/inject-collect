import { useRoute } from './router';
import { Home } from './screens/Home';
import { CaseScreen } from './screens/CaseScreen';
import { ExportScreen } from './screens/Export';
import { SettingsScreen } from './screens/Settings';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'case':
      return <CaseScreen key={route.id} id={route.id} step={route.step} query={route.query} />;
    case 'export':
      return <ExportScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <Home />;
  }
}
