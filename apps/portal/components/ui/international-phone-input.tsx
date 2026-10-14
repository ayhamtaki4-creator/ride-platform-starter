"use client";

import PhoneInput from "react-phone-input-2";
import arabicCountries from "react-phone-input-2/lang/ar.json";

type InternationalPhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  ariaInvalid?: boolean;
  autoComplete?: string;
  placeholder?: string;
  ariaLabel?: string;
};

export function InternationalPhoneInput({
  value,
  onChange,
  id,
  name = "phone",
  required = false,
  ariaInvalid = false,
  autoComplete = "tel",
  placeholder = "أدخل رقم الهاتف",
  ariaLabel = "رقم الهاتف مع رمز الدولة",
}: InternationalPhoneInputProps) {
  return (
    <>
      <link rel="stylesheet" href="/vendor/react-phone-input.css" precedence="route-vendor" />
      <link rel="stylesheet" href="/vendor/syrian-flag-override.css" precedence="route-phone-overrides" />
      <PhoneInput
        country="sy"
        preferredCountries={["sy", "lb", "jo"]}
        value={value.replace(/\D/g, "")}
        onChange={(digits, country) => {
          let normalized = digits.replace(/\D/g, "");
          // react-phone-input-2 already pre-fills the dial code. When a customer
          // pastes a complete international number, some browsers append a second
          // dial code (e.g. 9639639...). Strip only a *full-length* duplicate,
          // not a legitimate national number that happens to start with 963.
          const info = typeof country === "object" && country !== null ? country : null;
          const dial = info && "dialCode" in info ? String(info.dialCode).replace(/\D/g, "") : "";
          const iso = info && "countryCode" in info ? String(info.countryCode).toLowerCase() : "";
          const minNationalDigits = iso === "sy" ? 9 : iso === "lb" ? 7 : iso === "jo" ? 8 : 7;
          if (dial && normalized.startsWith(dial + dial) &&
              normalized.length >= dial.length * 2 + minNationalDigits) {
            normalized = normalized.slice(dial.length);
          }
          onChange(normalized ? `+${normalized}` : "");
        }}
        localization={arabicCountries}
        enableSearch
        autocompleteSearch
        searchPlaceholder="ابحث عن الدولة أو الرمز"
        searchNotFound="لا توجد دولة مطابقة"
        countryCodeEditable={false}
        specialLabel=""
        placeholder={placeholder}
        containerClass="international-phone-input"
        inputClass="input international-phone-field"
        buttonClass="international-phone-country-button"
        dropdownClass="international-phone-dropdown"
        searchClass="international-phone-search"
        inputProps={{
          id,
          name,
          required,
          "aria-invalid": ariaInvalid,
          autoComplete,
          "aria-label": ariaLabel,
          dir: "ltr",
        }}
      />
    </>
  );
}
