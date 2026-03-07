import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { CargoList } from './components/CargoList';
import { CargoDetail } from './components/CargoDetail';
import { useThemeToggle } from './hooks/useThemeToggle';
import { useAuth } from './auth/AuthContext';

type CargoListRouteProps = {
  onLogout: () => void;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
};

type CargoDetailRouteProps = {
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
};

function buildTenantBasePath(tenantSlug?: string) {
  return tenantSlug ? `/t/${tenantSlug}` : '';
}

function CargoListRoute({ onLogout, onToggleTheme, theme }: CargoListRouteProps) {
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const basePath = buildTenantBasePath(tenantSlug);

  const handleSelectCargo = (cargoId: string) => {
    navigate(`${basePath}/shipments/${cargoId}`);
  };

  return (
    <CargoList
      onSelectCargo={handleSelectCargo}
      onLogout={onLogout}
      onToggleTheme={onToggleTheme}
      theme={theme}
    />
  );
}

function CargoDetailRoute({ onToggleTheme, theme }: CargoDetailRouteProps) {
  const { cargoId, tenantSlug } = useParams();
  const navigate = useNavigate();
  const basePath = buildTenantBasePath(tenantSlug);

  if (!cargoId) {
    return <Navigate to={basePath || '/'} replace />;
  }

  return (
    <CargoDetail
      cargoId={cargoId}
      onBack={() => navigate(basePath || '/', { replace: false })}
      onToggleTheme={onToggleTheme}
      theme={theme}
    />
  );
}

export default function App() {
  const { ready, authenticated, logout } = useAuth();
  const { theme, toggleTheme } = useThemeToggle();

  useEffect(() => {
    if (!authenticated) {
      // AuthContext will flip `authenticated` to false, which will reset screens.
    }
  }, [authenticated]);

  const handleLogout = async () => {
    await logout();
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div>Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    // Redirect to dedicated auth portal (neutral login page)
    const authPortalUrl = import.meta.env.VITE_AUTH_PORTAL_URL as string | undefined;
    if (!authPortalUrl) {
      throw new Error('Missing required env var: VITE_AUTH_PORTAL_URL');
    }
    window.location.href = authPortalUrl;
    return null;
  }

  return (
    <Routes>
      <Route
        path="/t/:tenantSlug/shipments/:cargoId"
        element={<CargoDetailRoute onToggleTheme={toggleTheme} theme={theme} />}
      />
      <Route
        path="/shipments/:cargoId"
        element={<CargoDetailRoute onToggleTheme={toggleTheme} theme={theme} />}
      />
      <Route
        path="/t/:tenantSlug"
        element={<CargoListRoute onLogout={handleLogout} onToggleTheme={toggleTheme} theme={theme} />}
      />
      <Route
        path="/"
        element={<CargoListRoute onLogout={handleLogout} onToggleTheme={toggleTheme} theme={theme} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
