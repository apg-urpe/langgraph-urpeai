'use client';

import React, { useCallback, memo, CSSProperties } from 'react';
// @ts-expect-error - react-window has its own types
import { FixedSizeList as List } from 'react-window';
// @ts-expect-error - auto-sizer has its own types  
import AutoSizer from 'react-virtualized-auto-sizer';
import { ContactDisplayData, ContactContext } from '../../types/contact';
import { ContactCard } from './contacts/ContactCard';

const ITEM_HEIGHT = 120; // Optimizado: altura más compacta para ver más items
const ITEM_GAP = 4;   // Reducido gap para mayor densidad visual

interface VirtualizedContactListProps {
  contacts: ContactDisplayData[];
  contextMap: Map<number, ContactContext>;
  selectedContactId: number | null;
  onSelectContact: (contactId: number) => void;
}

interface ItemData {
  contacts: ContactDisplayData[];
  contextMap: Map<number, ContactContext>;
  selectedContactId: number | null;
  onSelectContact: (contactId: number) => void;
}

interface RowProps {
  index: number;
  style: CSSProperties;
  data: ItemData;
}

const ContactRow = memo(({ index, style, data }: RowProps) => {
  const { contacts, contextMap, selectedContactId, onSelectContact } = data;
  const contact = contacts[index];
  const context = contextMap.get(contact.id);
  
  if (!context) return null;
  
  const isSelected = selectedContactId === contact.id;
  
  return (
    <div 
      style={{ 
        ...style, 
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: index === 0 ? 0 : ITEM_GAP / 2,
        paddingBottom: ITEM_GAP / 2,
      }}
    >
      <ContactCard
        contact={contact}
        context={context}
        isSelected={isSelected}
        onClick={() => onSelectContact(contact.id)}
      />
    </div>
  );
});

ContactRow.displayName = 'ContactRow';

export const VirtualizedContactList: React.FC<VirtualizedContactListProps> = memo(({
  contacts,
  contextMap,
  selectedContactId,
  onSelectContact
}) => {
  const itemData: ItemData = React.useMemo(() => ({
    contacts,
    contextMap,
    selectedContactId,
    onSelectContact
  }), [contacts, contextMap, selectedContactId, onSelectContact]);

  const getItemKey = useCallback((index: number, data: ItemData) => {
    return data.contacts[index].id;
  }, []);

  if (contacts.length === 0) {
    return null;
  }

  return (
    <AutoSizer>
      {({ height, width }: { height: number; width: number }) => (
        <List
          height={height}
          width={width}
          itemCount={contacts.length}
          itemSize={ITEM_HEIGHT}
          itemData={itemData}
          itemKey={getItemKey}
          overscanCount={5} // Incrementado para scroll más suave
          className="custom-scrollbar"
        >
          {ContactRow}
        </List>
      )}
    </AutoSizer>
  );
});

VirtualizedContactList.displayName = 'VirtualizedContactList';

export default VirtualizedContactList;
