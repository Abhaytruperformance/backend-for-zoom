import "./landing.css";
import Footer from "./components/Footer.js";
import Banner from "./components/Banner.js";
import Navigation from "./components/Navigation.js";
import BrandSection from "./components/BrandSection.js";
import CTASection from "./components/CTASection.js";
import SubscriptionPlan from "./components/SubscriptionPlan.js";

export default function Landing() {
  return (
    <div className="tru-landing font-inter min-h-screen bg-white">
      <Navigation />
      <Banner />
      <BrandSection />
      <SubscriptionPlan />
      <CTASection />
      <Footer />
    </div>
  );
}
