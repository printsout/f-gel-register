import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Landing from "@/pages/public/Landing";
import RegisterBird from "@/pages/public/RegisterBird";
import ReportFound from "@/pages/public/ReportFound";
import FoundBirdsList from "@/pages/public/FoundBirdsList";

import Dashboard from "@/pages/admin/Dashboard";
import RegisteredBirds from "@/pages/admin/RegisteredBirds";
import FoundBirds from "@/pages/admin/FoundBirds";
import Users from "@/pages/admin/Users";
import DiscountCodes from "@/pages/admin/DiscountCodes";
import Feedback from "@/pages/admin/Feedback";
import Comments from "@/pages/admin/Comments";
import Activity from "@/pages/admin/Activity";

function AppRoutes() {
    const location = useLocation();
    // Synchronous check during render – processes new session_id FIRST
    if (location.hash?.includes("session_id=")) {
        return <AuthCallback />;
    }
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Landing />} />
            <Route path="/registrera-fagel" element={<RegisterBird />} />
            <Route path="/rapportera-hittad" element={<ReportFound />} />
            <Route path="/hittade-faglar" element={<FoundBirdsList />} />

            <Route
                path="/admin"
                element={
                    <ProtectedRoute requireAdmin>
                        <Dashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/registered-birds"
                element={
                    <ProtectedRoute requireAdmin>
                        <RegisteredBirds />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/found-birds"
                element={
                    <ProtectedRoute requireAdmin>
                        <FoundBirds />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/users"
                element={
                    <ProtectedRoute requireAdmin>
                        <Users />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/discount-codes"
                element={
                    <ProtectedRoute requireAdmin>
                        <DiscountCodes />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/comments"
                element={
                    <ProtectedRoute requireAdmin>
                        <Comments />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/feedback"
                element={
                    <ProtectedRoute requireAdmin>
                        <Feedback />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/activity"
                element={
                    <ProtectedRoute requireAdmin>
                        <Activity />
                    </ProtectedRoute>
                }
            />
            <Route path="*" element={<Landing />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRoutes />
                <Toaster
                    position="top-right"
                    richColors
                    closeButton
                    toastOptions={{
                        classNames: {
                            toast: "font-sans",
                        },
                    }}
                />
            </AuthProvider>
        </BrowserRouter>
    );
}
