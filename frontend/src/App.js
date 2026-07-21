import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Landing from "@/pages/public/Landing";
import RegisterBird from "@/pages/public/RegisterBird";
import ReportFound from "@/pages/public/ReportFound";
import ReportMissing from "@/pages/public/ReportMissing";
import FoundBirdsList from "@/pages/public/FoundBirdsList";
import Gallery from "@/pages/public/Gallery";
import MyBirds from "@/pages/public/MyBirds";
import ContentPage from "@/pages/public/ContentPage";
import PaymentSuccess from "@/pages/public/PaymentSuccess";
import PaymentCancel from "@/pages/public/PaymentCancel";
import Contact from "@/pages/public/Contact";
import ForgotPassword from "@/pages/public/ForgotPassword";
import ResetPassword from "@/pages/public/ResetPassword";

import Dashboard from "@/pages/admin/Dashboard";
import RegisteredBirds from "@/pages/admin/RegisteredBirds";
import FoundBirds from "@/pages/admin/FoundBirds";
import Users from "@/pages/admin/Users";
import DiscountCodes from "@/pages/admin/DiscountCodes";
import Feedback from "@/pages/admin/Feedback";
import Comments from "@/pages/admin/Comments";
import Activity from "@/pages/admin/Activity";
import AdminPosts from "@/pages/admin/Posts";
import AdminMissingBirds from "@/pages/admin/MissingBirds";
import AdminContent from "@/pages/admin/Content";
import AdminHomepage from "@/pages/admin/Homepage";
import AdminMenu from "@/pages/admin/Menu";
import AdminPaymentPlans from "@/pages/admin/PaymentPlans";
import AdminContactMessages from "@/pages/admin/ContactMessages";
import OwnershipTransfer from "@/pages/public/OwnershipTransfer";
import OwnershipTransfersAdmin from "@/pages/admin/OwnershipTransfers";
import CookieConsent from "@/components/CookieConsent";

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
            <Route path="/rapportera-bortflygen" element={<ReportMissing />} />
            <Route path="/hittade-faglar" element={<FoundBirdsList />} />
            <Route path="/galleri" element={<Gallery />} />
            <Route path="/mina-faglar" element={<MyBirds />} />
            <Route path="/agarbyte" element={<OwnershipTransfer />} />
            <Route path="/sidor/:slug" element={<ContentPage />} />
            <Route path="/kontakt" element={<Contact />} />
            <Route path="/glomt-losenord" element={<ForgotPassword />} />
            <Route path="/aterstall-losenord/:token" element={<ResetPassword />} />
            <Route path="/betalning/lyckad" element={<PaymentSuccess />} />
            <Route path="/betalning/avbruten" element={<PaymentCancel />} />

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
                path="/admin/posts"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminPosts />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/missing-birds"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminMissingBirds />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/content"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminContent />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/homepage"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminHomepage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/menu"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminMenu />
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
            <Route
                path="/admin/payment-plans"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminPaymentPlans />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/contact-messages"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminContactMessages />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/ownership-transfers"
                element={
                    <ProtectedRoute requireAdmin>
                        <OwnershipTransfersAdmin />
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
                <CookieConsent />
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
