import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'react-email';
import { discountLabel, type BookingView } from './booking-view';

const ACCENT = '#7C3AED';

const styles = {
  body: { backgroundColor: '#f5f5f5', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: '24px 0' },
  container: { backgroundColor: '#ffffff', borderRadius: 12, padding: 32, maxWidth: 560, margin: '0 auto', border: '1px solid #e5e5e5' },
  logo: { fontSize: 22, fontWeight: 900, letterSpacing: -0.5, color: '#000000', margin: 0 },
  h1: { fontSize: 22, fontWeight: 700, color: '#000000', margin: '24px 0 8px' },
  text: { fontSize: 15, lineHeight: '24px', color: '#333333', margin: '8px 0' },
  muted: { fontSize: 13, lineHeight: '20px', color: '#737373', margin: '8px 0' },
  row: { fontSize: 15, lineHeight: '26px', color: '#111111', margin: 0 },
  total: { fontSize: 17, fontWeight: 700, color: '#000000', margin: '8px 0 0' },
  button: { backgroundColor: ACCENT, color: '#ffffff', borderRadius: 8, padding: '12px 20px', fontSize: 15, fontWeight: 700, textDecoration: 'none' },
  code: { fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: ACCENT, letterSpacing: 2 },
};

function Layout({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.logo}>
            Space<span style={{ color: ACCENT }}>Hub</span>
          </Text>
          {children}
          <Hr style={{ borderColor: '#e5e5e5', margin: '24px 0' }} />
          <Text style={styles.muted}>
            הודעה זו נשלחה אוטומטית ממערכת ההזמנות של SpaceHub. לשאלות אפשר להשיב לוואטסאפ שלנו מהאתר.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function BookingDetails({ booking }: { booking: BookingView }) {
  return (
    <Section style={{ backgroundColor: '#fafafa', borderRadius: 8, padding: 16, margin: '16px 0' }}>
      <Text style={styles.row}>
        <strong>{booking.spaceName}</strong> · {booking.spaceTypeLabel}
      </Text>
      <Text style={styles.row}>סניף {booking.branchName}</Text>
      <Text style={styles.row}>
        {booking.dateLabel} · {booking.isDayPass ? `יום שלם (${booking.timeLabel})` : booking.timeLabel}
      </Text>
      {booking.spaceType === 'hotDesk' && <Text style={styles.row}>{booking.seats} מקומות</Text>}
      <Text style={styles.row}>
        מספר הזמנה: <span style={styles.code}>{booking.publicCode}</span>
      </Text>
    </Section>
  );
}

function PriceSummary({ booking }: { booking: BookingView }) {
  return (
    <Section style={{ margin: '8px 0' }}>
      <Text style={styles.row}>מחיר החלל: {booking.formatted.base}</Text>
      {booking.discountAmount > 0 && (
        <Text style={styles.row}>
          הנחה ({discountLabel(booking.discountSource, booking.pointsRedeemed)}): −{booking.formatted.discount}
        </Text>
      )}
      {booking.addons.map((a) => (
        <Text key={a.name} style={styles.row}>
          {a.name}: {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(a.lineTotal / 100)}
        </Text>
      ))}
      <Text style={styles.total}>סה״כ שולם: {booking.formatted.total}</Text>
      <Text style={styles.muted}>כולל מע״מ בסך {booking.formatted.vat}</Text>
    </Section>
  );
}

export function BookingConfirmationEmail({
  booking,
  manageUrl,
  calendarUrl,
}: {
  booking: BookingView;
  manageUrl: string;
  calendarUrl: string;
}) {
  return (
    <Layout preview={`ההזמנה שלך אושרה — ${booking.spaceName}, ${booking.dateLabel}`}>
      <Heading style={styles.h1}>ההזמנה אושרה ✓</Heading>
      <Text style={styles.text}>היי {booking.customerName ?? ''}, החלל שמור לך. קובץ יומן מצורף למייל.</Text>
      <BookingDetails booking={booking} />
      <PriceSummary booking={booking} />
      <Section style={{ margin: '20px 0' }}>
        <Button href={calendarUrl} style={styles.button}>
          הוספה ליומן Google
        </Button>
      </Section>
      <Text style={styles.text}>
        ביטול חינם עד 24 שעות לפני תחילת ההזמנה דרך <a href={manageUrl}>האזור האישי</a>.
      </Text>
      <Text style={styles.muted}>
        אישור זה אינו חשבונית מס. חשבונית תישלח בנפרד
        {booking.companyName ? ` על שם ${booking.companyName}` : ''}.
      </Text>
    </Layout>
  );
}

export function BookingCancelledEmail({ booking, refunded }: { booking: BookingView; refunded: boolean }) {
  return (
    <Layout preview={`ההזמנה ${booking.publicCode} בוטלה`}>
      <Heading style={styles.h1}>ההזמנה בוטלה</Heading>
      <BookingDetails booking={booking} />
      <Text style={styles.text}>
        {refunded
          ? `החזר בסך ${booking.formatted.total} בדרך לאמצעי התשלום שלך. לרוב הוא מופיע תוך 5–10 ימי עסקים.`
          : 'ההזמנה בוטלה ללא חיוב.'}
      </Text>
      {booking.pointsRedeemed > 0 && (
        <Text style={styles.text}>{booking.pointsRedeemed.toLocaleString('he-IL')} הנקודות שמימשת בהזמנה הוחזרו ליתרה שלך.</Text>
      )}
    </Layout>
  );
}

export function PointsExpiringEmail({
  name,
  points,
  expiresLabel,
  rewardsUrl,
}: {
  name: string | null;
  points: number;
  expiresLabel: string;
  rewardsUrl: string;
}) {
  const formatted = points.toLocaleString('he-IL');
  return (
    <Layout preview={`${formatted} נקודות יפוגו ב-${expiresLabel}`}>
      <Heading style={styles.h1}>הנקודות שלך עומדות לפוג</Heading>
      <Text style={styles.text}>
        היי {name ?? ''}, {formatted} נקודות מועדון יפוגו ב-{expiresLabel}. אפשר לממש אותן בהזמנה הבאה: כל 100 נקודות = ₪5, עד 50%
        ממחיר החלל.
      </Text>
      <Section style={{ margin: '20px 0' }}>
        <Button href={rewardsUrl} style={styles.button}>
          לפרטי הנקודות
        </Button>
      </Section>
    </Layout>
  );
}

export function SecurityNoticeEmail({ title, body }: { title: string; body: string }) {
  return (
    <Layout preview={title}>
      <Heading style={styles.h1}>{title}</Heading>
      <Text style={styles.text}>{body}</Text>
      <Text style={styles.muted}>לא אתם? היכנסו לאזור האישי ובחרו &quot;התנתקות מכל המכשירים&quot;, או פנו אלינו בוואטסאפ.</Text>
    </Layout>
  );
}

export function BookingReleasedEmail({ booking }: { booking: BookingView }) {
  return (
    <Layout preview={`שחררת את ${booking.spaceName} — תודה!`}>
      <Heading style={styles.h1}>החלל שוחרר — תודה!</Heading>
      <BookingDetails booking={booking} />
      <Text style={styles.text}>החלל חזר לזמינות עבור אחרים. לפי מדיניות הביטול, שחרור פחות מ-24 שעות לפני המועד אינו כולל החזר.</Text>
    </Layout>
  );
}

export function BookingReminderEmail({ booking, branchPhone, wazeUrl }: { booking: BookingView; branchPhone: string | null; wazeUrl: string | null }) {
  return (
    <Layout preview={`תזכורת: ${booking.spaceName} בעוד שעתיים`}>
      <Heading style={styles.h1}>נתראה בעוד שעתיים 👋</Heading>
      <BookingDetails booking={booking} />
      {wazeUrl && (
        <Section style={{ margin: '16px 0' }}>
          <Button href={wazeUrl} style={styles.button}>
            ניווט ב-Waze
          </Button>
        </Section>
      )}
      {branchPhone && <Text style={styles.text}>מתקשים למצוא חניה או את הכניסה? הקבלה בסניף: {branchPhone}</Text>}
    </Layout>
  );
}

export function BookingConflictRefundEmail({ booking }: { booking: BookingView }) {
  return (
    <Layout preview="לא הצלחנו לשמור את החלל — החזר מלא בדרך">
      <Heading style={styles.h1}>מצטערים — החלל נתפס</Heading>
      <Text style={styles.text}>
        התשלום הושלם אחרי שזמן שמירת המקום (15 דקות) הסתיים, ובינתיים מישהו אחר הזמין את אותן שעות. ביצענו החזר מלא
        בסך {booking.formatted.total} לאמצעי התשלום שלך.
      </Text>
      <BookingDetails booking={booking} />
    </Layout>
  );
}
