import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { FormWizard } from './components/FormWizard';
import { PublicHomePage } from './components/PublicHomePage';
import { FormEditor } from './components/FormEditor';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginPage } from './components/AdminLoginPage';
import { AdminSettings } from './components/AdminSettings';
import { createDialog, getAdminDialog, getDialog, updateDialog } from './lib/dialogsApi';
import type { DialogRecord } from './lib/dialogsApi';
import { isAdminAuthenticated, verifyAdminSession } from './lib/adminAuth';
import { loadRuntimeMode, type RuntimeMode } from './lib/runtimeMode';
import type { FormSchema } from './types/schema';

function LoadingPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <p className="text-sm text-red-500">{message}</p>
    </div>
  );
}

function RequireAdmin({ runtimeMode }: { runtimeMode: RuntimeMode }) {
  const location = useLocation();
  const [status, setStatus] = useState<'checking' | 'ok' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;

    if (runtimeMode.demoMode) {
      setStatus('ok');
      return;
    }

    if (!isAdminAuthenticated()) {
      setStatus('denied');
      return;
    }

    verifyAdminSession()
      .then((username) => {
        if (!cancelled) {
          setStatus(username ? 'ok' : 'denied');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('denied');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeMode.demoMode]);

  if (status === 'checking') {
    return <LoadingPage message="Admin-Bereich wird geprüft …" />;
  }

  if (status === 'denied') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function FormPage({ schema }: { schema: FormSchema }) {
  useTheme();
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-primary mb-4 transition-colors">
          ← Alle Formulare
        </Link>
        <FormWizard schema={schema} />
      </div>
    </div>
  );
}

function DialogRoutePage() {
  useTheme();
  const { route } = useParams<{ route: string }>();
  const [schema, setSchema] = useState<DialogRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!route) {
      return;
    }

    let cancelled = false;
    setSchema(null);
    setError(null);

    getDialog(route)
      .then((dialog) => {
        if (!cancelled) {
          setSchema(dialog);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  if (error) {
    return <ErrorPage message={error} />;
  }

  if (!schema) {
    return <LoadingPage message="Dialog wird geladen …" />;
  }

  if (schema.isActive === false) {
    return <ErrorPage message="Dieser Dialog ist derzeit deaktiviert." />;
  }

  return <FormPage schema={schema} />;
}

function NewEditorPage() {
  const navigate = useNavigate();

  async function handleSave(schema: FormSchema) {
    const saved = await createDialog(schema);
    navigate(`/admin/dialogs/${saved.id}/edit`);
  }

  return <FormEditor onSave={handleSave} />;
}

function AdminEditEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [schema, setSchema] = useState<DialogRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;
    setSchema(null);
    setError(null);

    getAdminDialog(id)
      .then((dialog) => {
        if (!cancelled) {
          setSchema(dialog);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(updated: FormSchema) {
    if (!id) {
      return;
    }

    const saved = await updateDialog(id, updated);
    navigate(`/admin/dialogs/${saved.id}/edit`);
  }

  if (error) {
    return <ErrorPage message={error} />;
  }

  if (!schema) {
    return <LoadingPage message="Dialog wird geladen …" />;
  }

  return <FormEditor initialSchema={schema} onSave={handleSave} />;
}

export default function App() {
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRuntimeMode()
      .then((mode) => {
        if (!cancelled) setRuntimeMode(mode);
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeMode({ demoMode: false, dinoEnabled: false, emailEnabled: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!runtimeMode) {
    return <LoadingPage message="Anwendung wird geladen …" />;
  }

  return (
    <BrowserRouter>
      {runtimeMode.demoMode && <DemoBanner />}
      <Routes>
        <Route
          path="/admin/login"
          element={runtimeMode.demoMode ? <Navigate to="/admin" replace /> : <AdminLoginPage />}
        />
        <Route element={<RequireAdmin runtimeMode={runtimeMode} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/dialogs/new" element={<NewEditorPage />} />
          <Route path="/admin/dialogs/:id/edit" element={<AdminEditEditorPage />} />
        </Route>
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/:route" element={<DialogRoutePage />} />
      </Routes>
    </BrowserRouter>
  );
}

function DemoBanner() {
  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 text-center">
      Demo-Modus aktiv – Änderungen bleiben nur in dieser Sitzung erhalten. Es werden weder
      E-Mails versendet noch Daten an DiNo übertragen. Der{' '}
      <Link to="/admin" className="underline font-medium hover:text-amber-950">
        Admin-Bereich
      </Link>{' '}
      kann ohne Passwort genutzt werden, um Dialoge anzulegen oder zu bearbeiten – auch diese
      Änderungen bleiben ausschließlich in Ihrer Session.
    </div>
  );
}
