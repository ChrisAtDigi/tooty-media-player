import React from 'react'

/**
 * FocusRing — wraps any focusable element with the TV D-pad focus indicator.
 *
 * Adds the `focusable` class (required by js-spatial-navigation) and
 * `tabIndex={0}` so the element participates in spatial navigation.
 *
 * The gold ring-4 is applied via the `.sn-focused` CSS class in index.css
 * whenever js-spatial-navigation moves focus to this element.
 *
 * Usage:
 *   <FocusRing onClick={...} className="rounded-card">
 *     <img ... />
 *   </FocusRing>
 */
export default function FocusRing({ children, className = '', ...props }) {
  return (
    <div
      tabIndex={0}
      className={`focusable outline-none transition-[box-shadow] duration-tv ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}