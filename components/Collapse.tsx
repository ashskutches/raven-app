'use client';
/**
 * Collapse — project-wide animated collapse component.
 *
 * Framer Motion cannot tween `height: 0 → 'auto'` correctly without
 * `overflow: hidden` on the wrapper during animation. This component
 * handles that correctly: hidden while animating, visible when open
 * so content like dropdowns / tooltips inside can overflow.
 *
 * Usage:
 *   <Collapse open={isOpen}>
 *     <div>your content</div>
 *   </Collapse>
 */
import { motion, AnimatePresence } from 'framer-motion';

interface CollapseProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  duration?: number;
}

export function Collapse({ open, children, className, duration = 0.22 }: CollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
