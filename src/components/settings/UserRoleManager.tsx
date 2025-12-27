import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, UserPlus, X, Users, Shield } from 'lucide-react';
import { useUserRoles, useProfiles, useAssignRole, useRemoveRole, AppRole } from '@/hooks/useUserRoles';
import { AdminOnly } from '@/components/auth/RoleGate';
import { toast } from 'sonner';

const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-destructive/20 text-destructive border-destructive/30',
  cio: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  trader: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  research: 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  ops: 'bg-chart-4/20 text-chart-4 border-chart-4/30',
  auditor: 'bg-chart-5/20 text-chart-5 border-chart-5/30',
  viewer: 'bg-muted text-muted-foreground border-muted',
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: 'Full system access',
  cio: 'Capital allocation & risk oversight',
  trader: 'Execute trades & manage positions',
  research: 'View analytics & backtest strategies',
  ops: 'System monitoring & alerts',
  auditor: 'Read-only audit access',
  viewer: 'Basic read-only access',
};

const ALL_ROLES: AppRole[] = ['admin', 'cio', 'trader', 'research', 'ops', 'auditor', 'viewer'];

export function UserRoleManager() {
  const { data: userRoles, isLoading: rolesLoading } = useUserRoles();
  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();

  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');

  const isLoading = rolesLoading || profilesLoading;

  // Group roles by user
  const userRoleMap = new Map<string, { email: string; fullName: string | null; roles: AppRole[] }>();
  
  userRoles?.forEach((ur) => {
    const profile = (ur as any).profiles;
    const existing = userRoleMap.get(ur.user_id);
    if (existing) {
      existing.roles.push(ur.role);
    } else {
      userRoleMap.set(ur.user_id, {
        email: profile?.email || 'Unknown',
        fullName: profile?.full_name || null,
        roles: [ur.role],
      });
    }
  });

  // Get users without roles
  const usersWithoutRoles = profiles?.filter(
    (p) => !userRoleMap.has(p.id)
  ) || [];

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) {
      toast.error('Please select both a user and a role');
      return;
    }
    
    await assignRole.mutateAsync({ userId: selectedUser, role: selectedRole });
    setSelectedUser('');
    setSelectedRole('');
  };

  const handleRemoveRole = async (userId: string, role: AppRole) => {
    await removeRole.mutateAsync({ userId, role });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <AdminOnly>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            User Role Management
          </CardTitle>
          <CardDescription>
            Assign roles to control access to trading features and sensitive operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add Role Section */}
          <div className="flex gap-3 items-end p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">User</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.email} {profile.full_name && `(${profile.full_name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <Shield className="h-3 w-3" />
                        <span className="capitalize">{role}</span>
                        <span className="text-xs text-muted-foreground">
                          - {ROLE_DESCRIPTIONS[role]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleAssignRole}
              disabled={!selectedUser || !selectedRole || assignRole.isPending}
            >
              {assignRole.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Assign Role
            </Button>
          </div>

          {/* Current Assignments */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoleMap.size === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No role assignments yet
                    </TableCell>
                  </TableRow>
                ) : (
                  Array.from(userRoleMap.entries()).map(([userId, userData]) => (
                    <TableRow key={userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {userData.email.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{userData.fullName || userData.email}</p>
                            {userData.fullName && (
                              <p className="text-xs text-muted-foreground">{userData.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {userData.roles.map((role) => (
                            <Badge
                              key={role}
                              variant="outline"
                              className={ROLE_COLORS[role]}
                            >
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {userData.roles.map((role) => (
                            <Button
                              key={role}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveRole(userId, role)}
                              disabled={removeRole.isPending}
                              title={`Remove ${role} role`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Users Without Roles */}
          {usersWithoutRoles.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Users without roles ({usersWithoutRoles.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {usersWithoutRoles.map((profile) => (
                  <Badge key={profile.id} variant="outline" className="text-muted-foreground">
                    {profile.email}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Role Legend */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Role Permissions</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {ALL_ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className={ROLE_COLORS[role]}>
                    {role}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">
                    {ROLE_DESCRIPTIONS[role]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminOnly>
  );
}
