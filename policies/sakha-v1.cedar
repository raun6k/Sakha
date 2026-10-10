permit(principal is Sakha::Farmer, action in [Sakha::Action::"read",Sakha::Action::"write",Sakha::Action::"record_work",Sakha::Action::"decide_plan",Sakha::Action::"save_fact"], resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed };
permit(principal is Sakha::Agent, action in [Sakha::Action::"read",Sakha::Action::"memory",Sakha::Action::"propose",Sakha::Action::"peer",Sakha::Action::"clarify"], resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed && (!resource.private || context.privateGrant) };
