// react-bits components, copied from https://github.com/DavidHDev/react-bits
// (TS + Tailwind variants). These are self-contained and use motion/gsap/ogl.
// Each animated export should be wrapped in <MotionGuard> when reduced-motion
// must degrade to a static view.

export { default as CountUp } from './CountUp/CountUp';
export { default as GradientText } from './GradientText/GradientText';
export { default as FadeContent } from './FadeContent/FadeContent';
export { default as Aurora } from './Aurora/Aurora';
export { MotionGuard } from './MotionGuard';
