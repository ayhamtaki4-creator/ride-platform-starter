"use client";

import PhoneInput from "react-phone-input-2";
import arabicCountries from "react-phone-input-2/lang/ar.json";

type InternationalPhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
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
  autoComplete = "tel",
  placeholder = "أدخل رقم الهاتف",
  ariaLabel = "رقم الهاتف مع رمز الدولة",
}: InternationalPhoneInputProps) {
  return (
    <>
      <link rel="stylesheet" href="/vendor/react-phone-input.css" precedence="route-vendor" />
      <PhoneInput
        country="sy"
        preferredCountries={["sy", "lb", "jo"]}
        value={value.replace(/\D/g, "")}
        onChange={(digits) => {
          const normalized = digits.replace(/\D/g, "");
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
          autoComplete,
          "aria-label": ariaLabel,
          dir: "ltr",
        }}
      />
    </>
  );
}
