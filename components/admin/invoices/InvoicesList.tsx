import React, { useEffect, useState } from 'react';
import {
  FileText,
  ExternalLink,
  Download,
  Calendar,
  DollarSign,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Receipt,
  Archive,
  X
} from 'lucide-react';
import { useInvoiceStore, selectInvoices, selectIsLoading, selectError } from '../../../store/invoiceStore';
import { Invoice, getInvoiceStatusConfig, formatInvoiceCurrency, formatInvoiceDate } from '../../../types/invoice';

interface InvoicesListProps {
  contactId?: number;
  serviceId?: number;
  empresaId: number;
}

export const InvoicesList: React.FC<InvoicesListProps> = ({
  contactId,
  serviceId,
  empresaId
}) => {
  const invoices = useInvoiceStore(selectInvoices);
  const isLoading = useInvoiceStore(selectIsLoading);
  const error = useInvoiceStore(selectError);
  const fetchInvoicesByContact = useInvoiceStore(state => state.fetchInvoicesByContact);
  const fetchInvoicesByService = useInvoiceStore(state => state.fetchInvoicesByService);
  const archiveInvoice = useInvoiceStore(state => state.archiveInvoice);
  const [confirmArchive, setConfirmArchive] = useState<number | null>(null);

  const handleArchive = async (invoiceId: number) => {
    const success = await archiveInvoice(invoiceId);
    if (success) setConfirmArchive(null);
  };

  useEffect(() => {
    if (serviceId) {
      fetchInvoicesByService(serviceId);
    } else if (contactId) {
      fetchInvoicesByContact(contactId, empresaId);
    }
  }, [contactId, serviceId, empresaId, fetchInvoicesByContact, fetchInvoicesByService]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pagada': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'emitida': return <Clock className="w-3.5 h-3.5" />;
      case 'vencida': return <AlertCircle className="w-3.5 h-3.5" />;
      case 'anulada': return <XCircle className="w-3.5 h-3.5" />;
      default: return <FileText className="w-3.5 h-3.5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 text-rose-400 text-sm">
        <AlertCircle className="w-4 h-4 mr-2" />
        {error}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <Receipt className="w-10 h-10 text-zinc-600 mb-2" />
        <p className="text-zinc-400 text-sm">No hay facturas registradas</p>
        <p className="text-zinc-500 text-xs mt-1">
          Las facturas generadas aparecerán aquí
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-zinc-400 mb-3">
        <FileText className="w-4 h-4" />
        <span className="text-sm font-medium">Facturas</span>
        <span className="text-xs text-zinc-500">({invoices.length})</span>
      </div>

      {invoices.map((invoice: Invoice) => {
        const statusConfig = getInvoiceStatusConfig(invoice.estado);
        
        return (
          <div
            key={invoice.id}
            className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 
                     hover:border-white/10 transition-all"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100 text-sm">
                    {invoice.numero_factura}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${statusConfig.color}`}>
                    {getStatusIcon(invoice.estado)}
                    {statusConfig.label}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {invoice.cliente_nombre}
                </p>
              </div>
              
              <div className="flex items-center gap-1">
                {invoice.pdf_url && (
                  <a
                    href={invoice.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-zinc-400 hover:text-primary-400 
                             hover:bg-primary-500/10 rounded-md transition-colors"
                    title="Ver PDF"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {confirmArchive === invoice.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleArchive(invoice.id)}
                      className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-md transition-colors"
                      title="Confirmar archivar"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmArchive(null)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-md transition-colors"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmArchive(invoice.id)}
                    className="p-1.5 text-zinc-400 hover:text-amber-400 
                             hover:bg-amber-500/10 rounded-md transition-colors"
                    title="Archivar factura"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-500">
                <Calendar className="w-3 h-3" />
                <span>{formatInvoiceDate(invoice.fecha_emision)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-500">
                <DollarSign className="w-3 h-3" />
                <span className="text-zinc-300 font-medium">
                  {formatInvoiceCurrency(invoice.total, invoice.moneda)}
                </span>
              </div>
              {invoice.saldo_pendiente > 0 && (
                <div className="flex items-center gap-1.5 text-amber-400">
                  <AlertCircle className="w-3 h-3" />
                  <span>
                    Pend: {formatInvoiceCurrency(invoice.saldo_pendiente, invoice.moneda)}
                  </span>
                </div>
              )}
            </div>

            {/* Due Date Warning */}
            {invoice.fecha_vencimiento && invoice.estado === 'emitida' && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-xs text-zinc-500">
                  Vence: {formatInvoiceDate(invoice.fecha_vencimiento)}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
