import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function Barcode({ value, format = 'CODE128', width = 2, height = 50, displayValue = true }) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: format,
          width: width,
          height: height,
          displayValue: displayValue,
          fontSize: 14,
          margin: 10
        });
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [value, format, width, height, displayValue]);

  if (!value) return null;

  return (
    <div className="flex flex-col items-center">
      <svg ref={barcodeRef} className="max-w-full" />
    </div>
  );
}

