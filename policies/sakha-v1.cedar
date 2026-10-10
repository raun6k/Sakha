permit(principal is Sakha::Farmer, action, resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed };
permit(principal is Sakha::Agent, action, resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed && (!resource.private || context.privateGrant) }
unless { action == Sakha::Action::"record_work" || action == Sakha::Action::"decide_plan" || action == Sakha::Action::"save_fact" };
