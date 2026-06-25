interface AppLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Logo ~1.84:1 (car + document, transparent PNG)
const sizes = {
  sm: "h-8 w-[3.75rem]",
  md: "h-14 w-[6.5rem]",
  lg: "h-[4.75rem] w-[8.75rem]",
};

export function AppLogo({ size = "sm", className = "" }: AppLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png?v=6"
      alt=""
      className={`object-contain object-center ${sizes[size]} ${className}`}
    />
  );
}
