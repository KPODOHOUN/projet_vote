import { gsap } from "gsap";

export const motionPresets = {
  revealUp: {
    from: { y: 24, autoAlpha: 0 },
    to: { y: 0, autoAlpha: 1, duration: 0.45, ease: "power2.out" },
  },
  cardHover: {
    to: { y: -4, duration: 0.2, ease: "power2.out" },
  },
  modalIn: {
    from: { scale: 0.96, autoAlpha: 0 },
    to: { scale: 1, autoAlpha: 1, duration: 0.24, ease: "power2.out" },
  },
} as const;

export function animateRevealUp(target: gsap.TweenTarget) {
  return gsap.fromTo(target, motionPresets.revealUp.from, motionPresets.revealUp.to);
}

export function animateModalIn(target: gsap.TweenTarget) {
  return gsap.fromTo(target, motionPresets.modalIn.from, motionPresets.modalIn.to);
}

export function attachCardHover(target: HTMLElement) {
  const enter = () => gsap.to(target, motionPresets.cardHover.to);
  const leave = () => gsap.to(target, { y: 0, duration: 0.2, ease: "power2.out" });
  target.addEventListener("mouseenter", enter);
  target.addEventListener("mouseleave", leave);

  return () => {
    target.removeEventListener("mouseenter", enter);
    target.removeEventListener("mouseleave", leave);
  };
}
