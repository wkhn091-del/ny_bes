export default function StudioLayout({ children }: LayoutProps<'/studio'>) {
  return (
    <div dir="ltr" lang="en" className="h-dvh">
      {children}
    </div>
  );
}
