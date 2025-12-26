import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Activity,
  Shield,
  AlertTriangle,
  Info
} from 'lucide-react';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';

type AuditEvent = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  user_email: string | null;
  book_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  before_state: any;
  after_state: any;
  ip_address: string | null;
  created_at: string;
};

type AuditAnalyticsDashboardProps = {
  events: AuditEvent[];
};

const SEVERITY_COLORS = {
  info: 'hsl(var(--primary))',
  warning: 'hsl(var(--warning))',
  critical: 'hsl(var(--destructive))',
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function AuditAnalyticsDashboard({ events }: AuditAnalyticsDashboardProps) {
  // Event frequency over time (last 7 days)
  const frequencyData = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    });

    return last7Days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayEvents = events.filter(e => {
        const eventDate = new Date(e.created_at);
        return eventDate >= dayStart && eventDate < dayEnd;
      });

      return {
        date: format(day, 'MMM dd'),
        total: dayEvents.length,
        info: dayEvents.filter(e => e.severity === 'info').length,
        warning: dayEvents.filter(e => e.severity === 'warning').length,
        critical: dayEvents.filter(e => e.severity === 'critical').length,
      };
    });
  }, [events]);

  // Top users by activity
  const topUsersData = useMemo(() => {
    const userCounts: Record<string, number> = {};
    events.forEach(e => {
      const user = e.user_email || 'System';
      userCounts[user] = (userCounts[user] || 0) + 1;
    });

    return Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name: name.split('@')[0], count }));
  }, [events]);

  // Severity distribution
  const severityData = useMemo(() => {
    const counts = {
      info: events.filter(e => e.severity === 'info').length,
      warning: events.filter(e => e.severity === 'warning').length,
      critical: events.filter(e => e.severity === 'critical').length,
    };

    return [
      { name: 'Info', value: counts.info, color: SEVERITY_COLORS.info },
      { name: 'Warning', value: counts.warning, color: SEVERITY_COLORS.warning },
      { name: 'Critical', value: counts.critical, color: SEVERITY_COLORS.critical },
    ].filter(d => d.value > 0);
  }, [events]);

  // Top actions
  const topActionsData = useMemo(() => {
    const actionCounts: Record<string, number> = {};
    events.forEach(e => {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    });

    return Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([action, count]) => ({ action, count }));
  }, [events]);

  // Resource type distribution
  const resourceTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      counts[e.resource_type] = (counts[e.resource_type] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], idx) => ({ 
        name, 
        value, 
        color: CHART_COLORS[idx % CHART_COLORS.length] 
      }));
  }, [events]);

  // Hourly activity pattern
  const hourlyPattern = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hours[i] = 0;

    events.forEach(e => {
      const hour = new Date(e.created_at).getHours();
      hours[hour]++;
    });

    return Object.entries(hours).map(([hour, count]) => ({
      hour: `${hour.padStart(2, '0')}:00`,
      count,
    }));
  }, [events]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No data available for analytics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold">{events.length}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold">
                {events.filter(e => e.severity === 'critical').length}
              </p>
              <p className="text-xs text-muted-foreground">Critical Events</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Shield className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold">
                {new Set(events.map(e => e.action)).size}
              </p>
              <p className="text-xs text-muted-foreground">Unique Actions</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold">
                {new Set(events.map(e => e.user_id).filter(Boolean)).size}
              </p>
              <p className="text-xs text-muted-foreground">Active Users</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-3 gap-4">
        {/* Event Frequency Over Time */}
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Event Frequency (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={frequencyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="critical" 
                  stackId="1" 
                  stroke={SEVERITY_COLORS.critical} 
                  fill={SEVERITY_COLORS.critical}
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="warning" 
                  stackId="1" 
                  stroke={SEVERITY_COLORS.warning} 
                  fill={SEVERITY_COLORS.warning}
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="info" 
                  stackId="1" 
                  stroke={SEVERITY_COLORS.info} 
                  fill={SEVERITY_COLORS.info}
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Severity Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-warning" />
              Severity Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {severityData.map((s) => (
                <div key={s.name} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-mono font-medium">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Top Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topUsersData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={80} 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-chart-2" />
              Top Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topActionsData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis 
                  dataKey="action" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hourly Activity Pattern */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-chart-3" />
              Hourly Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={hourlyPattern}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis 
                  dataKey="hour" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                  interval={3}
                />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--chart-3))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Resource Types */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Events by Resource Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {resourceTypeData.map((item) => (
              <Badge 
                key={item.name} 
                variant="outline"
                className="px-3 py-1.5"
                style={{ borderColor: item.color }}
              >
                <span className="font-medium">{item.name}</span>
                <span className="ml-2 font-mono text-muted-foreground">{item.value}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
