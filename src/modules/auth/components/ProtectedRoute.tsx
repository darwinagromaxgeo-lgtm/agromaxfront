import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider';
import { AppLoading } from '../../../shared/components/AppLoading';
import { accessRole, canAccessView, roleHome } from '../../../shared/utils/accessPolicy';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, isLoading, selectedBranch } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen grid place-items-center bg-[#f7f7ef]"><AppLoading /></div>;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!canAccessView(accessRole(user, selectedBranch?.id), location.pathname, user) || (roles && !roles.includes(user.role))) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return <>{children}</>;
}
