import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetAuthStatus } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

import NotFound from "@/pages/not-found";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Broadcast from "./pages/Broadcast";
import Monitor from "./pages/Monitor";
import { Layout } from "./components/Layout";
import React from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType, path: string }) {
  const { data: auth, isLoading } = useGetAuthStatus();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (!isLoading && !auth?.authorized) {
      setLocation("/login");
    }
  }, [isLoading, auth, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth?.authorized) {
    return null; // Will redirect via useEffect
  }

  return <Component />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" render={() => <ProtectedRoute path="/" component={Dashboard} />} />
        <Route path="/broadcast" render={() => <ProtectedRoute path="/broadcast" component={Broadcast} />} />
        <Route path="/monitor" render={() => <ProtectedRoute path="/monitor" component={Monitor} />} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
