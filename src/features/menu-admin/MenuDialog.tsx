import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'

export function MenuDialog({
  labelledBy,
  className,
  role = 'dialog',
  describedBy,
  onClose,
  children,
}: {
  labelledBy: string
  className: string
  role?: 'dialog' | 'alertdialog'
  describedBy?: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={`menu-dialog ${className}`}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
    >
      {children}
    </dialog>
  )
}
