import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../ui/card.js";
import { Separator } from "../ui/separator.js";
import { Badge } from "../ui/badge.js";
import { useState } from "react";
import GradientButton from "../GradientButton.js";

interface PlanFeature {
  name: string;
  included: boolean;
}

interface PlanData {
  id: number;
  icon?: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  description: string;
  features: PlanFeature[];
  isPopular?: boolean;
  buttonText: string;
}

const plansData: PlanData[] = [
  {
    id: 1,
    icon: "/lp/freePlanicon.svg",
    name: "Free",
    monthlyPrice: 0,
    description: "For a single user trying the core pipeline end to end.",
    features: [
      { name: "1 user", included: true },
      { name: "Connect your own Zoom account", included: true },
      { name: "AI meeting summaries & decisions", included: true },
      { name: "Follow-up email drafting", included: true },
      { name: "Relationship history across meetings", included: false },
      { name: "Team seats", included: false },
    ],
    buttonText: "Start Free",
  },
  {
    id: 2,
    icon: "/lp/proPlanicon.svg",
    name: "Pro",
    monthlyPrice: 20,
    description: "For a team that wants the full relationship-intelligence loop.",
    isPopular: true,
    features: [
      { name: "Everything in Free", included: true },
      { name: "Unlimited team seats", included: true },
      { name: "Relationship history & decision supersession", included: true },
      { name: "Send via connected Gmail or Microsoft mailbox", included: true },
      { name: "Company-wide Zoom sync", included: false },
      { name: "Priority support", included: false },
    ],
    buttonText: "Go Pro",
  },
  {
    id: 3,
    icon: "/lp/businessPlanicon.svg",
    name: "Business",
    monthlyPrice: 100,
    yearlyPrice: 299,
    description: "For companies who want every meeting captured without per-user setup.",
    features: [
      { name: "Everything in Pro", included: true },
      { name: "Company-wide Zoom sync — no per-user connect", included: true },
      { name: "Priority support", included: true },
      { name: "Dedicated onboarding", included: true },
      { name: "", included: true },
      { name: "", included: true },
    ],
    buttonText: "Go With Business",
  },
];

export default function SubscriptionPlan() {
  const [billedYearly, setBilledYearly] = useState(false);

  return (
    <>
      <div
        id="pricing"
        className="md:bg-[url('/lp/pricingBnner.webp')] bg-[url('/lp/ourPricingMobileBg.webp')] bg-cover bg-center h-[403px] flex flex-col items-center text-center md:gap-[20px] gap-[16px] md:pt-[75px] pt-[50px] px-8 md:px-0 mx-auto"
      >
        <Badge variant="secondary" className="flex items-center px-3 py-2 gap-2 bg-white rounded-full shadow-[0_1px_1px_0_rgba(0,0,0,0.15),_0_3px_3px_0_rgba(0,0,0,0.05)]">
          <img src="/lp/2922751717.svg" alt="" width="15" height="15" />
          <Separator orientation="vertical" className="h-4 bg-[#F0F0F0] w-0.5" />
          <div className="text-[#4D4D4D] text-sm font-medium leading-[21px] font-inter">Our Pricing</div>
        </Badge>
        <h2 className="max-w-[286px] font-inter sm:max-w-[818px] text-[28px] sm:text-4xl lg:text-[42px] tracking-[-1px] font-medium leading-9 sm:leading-[58.8px]">
          <span className="gradient-text">Flexible Plans</span> <span className="text-[#1A1A1A] font-normal">That Grow With You</span>
        </h2>
        <p className="text-[#4D4D4D] text-center text-[16px] sm:text-[16px] font-normal leading-[24px] sm:leading-[24px] tracking-[-0.17px] md:mb-[48px] mb-[32px]">
          Start for free, upgrade when you're ready.
        </p>
      </div>

      <div className="mx-auto px-8 md:p-[32px] lg:p-0">
        <div className="container max-w-[1200px] h-full p-2 bg-white rounded-[20px] mx-auto flex flex-col sm:flex-row sm:items-center md:flex-col lg:flex-row justify-center gap-[36px] md:gap-[30px] -mt-[120px]">
          {plansData.map((plan) => {
            const hasYearly = plan.yearlyPrice !== undefined;
            const showingYearly = hasYearly && billedYearly;
            return (
              <Card
                key={plan.id}
                className={`w-full max-w-sm flex flex-col rounded-[24px] border border-[#D3D3D3] hover:bg-[#EAEAEA8C] bg-[#FFF] hover:shadow-[0_4px_10.8px_2px_rgba(0,0,0,0.20)]`}
              >
                <CardHeader className="md:p-[20px] p-[18px] rounded-t-[24px] bg-[#FFF] shadow-[0_1px_1px_0_rgba(0,0,0,0.15),0_3px_3px_0_rgba(0,0,0,0.05)]">
                  <CardTitle>
                    <div className="flex justify-between">
                      <div className="flex items-center gap-2 text-[16px] font-inter font-semibold text-[#1A1A1A] leading-6 mb-3">
                        {plan.icon && <img src={plan.icon} alt="" width="22" height="22" />}
                        {plan.name}
                      </div>
                      {plan.isPopular && (
                        <p className="rounded-3xl border border-[#FF5A24] leading-[21px] text-[14px] font-medium text-[#636363] px-[10px] py-1 font-inter">Most Popular</p>
                      )}
                    </div>
                    <div className="mt-[15px] mb-[16.5px] flex items-center gap-1">
                      <span className="text-[28px] font-inter font-semibold text-[#1A1A1A] leading-[42px] tracking-[-0.6px]">
                        ${showingYearly ? plan.yearlyPrice : plan.monthlyPrice}
                      </span>
                      <span className="text-[#4D4D4D] text-[14px] font-inter font-medium leading-[21px] tracking-[-0.3px]">{showingYearly ? "/per year" : "/per month"}</span>
                    </div>
                  </CardTitle>
                  <Separator className="mt-0 w-full h-[1px] bg-[#E0E0E0]" />
                </CardHeader>
                <CardContent className="md:px-[20px] px-[18px] bg-[#FFF] rounded-b-[24px] hover:bg-white flex-grow">
                  <div className="mb-[16.5px] flex flex-col gap-[18px]">
                    <p className="font-medium max-w-[257px] font-inter text-sm text-[#4D4D4D] leading-[21px] tracking-[-0.16px]">{plan.description}</p>
                    {hasYearly && (
                      <div className="flex items-center gap-2">
                        <div
                          className={`relative w-10 h-5 rounded-full cursor-pointer transition-all duration-300 ${billedYearly ? "bg-[#FF5A24]" : "bg-[#E0E0E0]"}`}
                          onClick={() => setBilledYearly((v) => !v)}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300 ${billedYearly ? "translate-x-5" : "translate-x-0.5"}`}></div>
                        </div>
                        <span className="text-[#4D4D4D] leading-[25px] text-[15px] font-medium">Billed yearly</span>
                      </div>
                    )}
                  </div>
                  <Separator className="mt-0 w-full bg-[#E0E0E0]" />
                  <ul className="flex flex-col gap-[14px] mt-[18px]">
                    {plan.features
                      .filter((f) => f.name)
                      .map((feature, index) => (
                        <li key={index} className={`flex items-center gap-[10px] font-[500] font-inter md:text-[14px] text-[14px] tracking-[-0.16px] ${feature.included ? "text-[#1A1A1A]" : "text-[#4D4D4D]"}`}>
                          {feature.included ? (
                            <img src="/lp/greenCheck.svg" alt="" width="24" height="24" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M6 12.75L9.75 16.5L18.75 7.5" stroke="#4D4D4D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          <span>{feature.name}</span>
                        </li>
                      ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-2 md:pt-[22px] pt-[18px] mt-auto">
                  <GradientButton className="text-center" icon={<img src="/lp/greenArrow.svg" alt="" />}>
                    {plan.buttonText}
                  </GradientButton>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-5 md:gap-0 md:mt-[20px] mt-[12px] md:mb-[50px] mb-[25px] md:px-4 px-8">
        <div className="flex items-center gap-3 md:pr-6">
          <img src="/lp/cancelIcon.svg" alt="" width="24" height="24" />
          <span className="text-[#1A1A1A] text-[14px] font-medium font-inter">Cancel anytime.</span>
        </div>
        <Separator orientation="vertical" className="hidden md:block shrink-0 h-6 w-px bg-[#D3D3D3]" />
        <Separator orientation="horizontal" className="md:hidden h-px w-full bg-[#D3D3D3]" />
        <div className="flex items-center gap-3 md:px-6">
          <img src="/lp/creditIcon.svg" alt="" width="24" height="24" />
          <span className="text-[#1A1A1A] text-[14px] font-medium font-inter">No credit card required for Free.</span>
        </div>
        <Separator orientation="vertical" className="hidden md:block shrink-0 h-6 w-px bg-[#D3D3D3]" />
        <Separator orientation="horizontal" className="md:hidden h-px w-full bg-[#D3D3D3]" />
        <div className="flex items-center gap-3 md:pl-6">
          <img src="/lp/feesIcon.svg" alt="" width="24" height="24" />
          <span className="text-[#1A1A1A] text-[14px] font-medium font-inter">No hidden fees.</span>
        </div>
      </div>
    </>
  );
}
