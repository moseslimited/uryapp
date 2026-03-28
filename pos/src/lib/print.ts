import { printWithQz } from './print-qz';
import {
  getInvoicePrintHtml,
  networkPrint,
  selectNetworkPrinter,
  printPosPage,
  updatePrintStatus
} from './invoice-api';
import { PosProfileCombined } from './pos-profile-api';

interface PrintOrderParams {
  orderId: string;
  posProfile: PosProfileCombined
}

/** Opens a new window with the invoice HTML and a Print / Save as PDF toolbar (browser print dialog). */
export async function openPrintWindow(orderId: string, printFormat: string | null): Promise<void> {
  const format = printFormat || 'POS Receipt';
  const html = await getInvoicePrintHtml(orderId, format);
  const win = window.open('', '_blank', 'width=800,height=900,scrollbars=yes,resizable=yes');
  if (!win) {
    throw new Error('Popup blocked. Please allow popups for this site and try again.');
  }
  const toolbar = `
    <div style="position:sticky;top:0;left:0;right:0;background:#f3f4f6;border-bottom:1px solid #e5e7eb;padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:9999;">
      <button type="button" onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:500;">
        Print / Save as PDF
      </button>
      <span style="color:#6b7280;font-size:14px;">Use the dialog to print or choose "Save as PDF" as destination.</span>
      <button type="button" onclick="window.close()" style="background:#e5e7eb;color:#374151;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-left:auto;">
        Close
      </button>
    </div>
  `;
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Print - ${orderId}</title>
      <style>body { margin: 0; font-family: system-ui, sans-serif; } .print-toolbar { } @media print { .print-toolbar { display: none !important; } }</style>
    </head>
    <body>
      <div class="print-toolbar">${toolbar}</div>
      <div class="print-content" style="padding:16px;">${html}</div>
      <script>
        window.onload = function() {
          var toolbar = document.querySelector('.print-toolbar');
          if (toolbar) toolbar.classList.add('print-toolbar');
        };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

export async function printOrder({ orderId, posProfile }: PrintOrderParams): Promise<'qz' | 'network' | 'socket'> {
  const { print_type, qz_host, print_format, printer, name, cashier, multiple_cashier } = posProfile;

  if (print_type === 'qz') {
    if (!qz_host) {
      throw new Error('QZ host is not set');
    }
    const html = await getInvoicePrintHtml(orderId, print_format as string);
    await printWithQz(qz_host, html);
    await updatePrintStatus(orderId);
    return 'qz';
  } else if (print_type === 'network') {
    if (cashier && !multiple_cashier) {
      await networkPrint(orderId, printer as string, print_format as string);
    } else {
      await selectNetworkPrinter(orderId, name);
    }
    await updatePrintStatus(orderId);
    return 'network';
  } else {
    await printPosPage(orderId, print_format as string);
    return 'socket';
  }
} 