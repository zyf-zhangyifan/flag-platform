DO $$
DECLARE fid BIGINT; rid BIGINT;
BEGIN
    INSERT INTO flags(name,key,environment,enabled,default_value)
    VALUES ('新版结算流程','checkout_v2','production',true,false)
    ON CONFLICT DO NOTHING RETURNING id INTO fid;
    IF fid IS NOT NULL THEN
        INSERT INTO history(flag_id,action,summary,changes) VALUES
            (fid,'flag.created','创建演示 Flag：新版结算流程',jsonb_build_object('name','新版结算流程','key','checkout_v2','environment','production','enabled',true,'default_value',false));
        INSERT INTO rules(flag_id,attribute,operator,expected,result,priority)
        VALUES (fid,'plan','equals','"enterprise"',true,10) RETURNING id INTO rid;
        INSERT INTO history(flag_id,action,summary,changes) VALUES
            (fid,'rule.created','添加规则：企业版优先开放',jsonb_build_object('after',(SELECT to_jsonb(r) FROM rules r WHERE id=rid)));
        INSERT INTO rules(flag_id,attribute,operator,expected,result,priority)
        VALUES (fid,'country','in','["CN","SG"]',true,20) RETURNING id INTO rid;
        INSERT INTO history(flag_id,action,summary,changes) VALUES
            (fid,'rule.created','添加规则：中国 / 新加坡开放',jsonb_build_object('after',(SELECT to_jsonb(r) FROM rules r WHERE id=rid)));
    END IF;
    INSERT INTO flags(name,key,environment,enabled,default_value)
    VALUES ('新版结算流程 · 预发布','checkout_v2','staging',true,true)
    ON CONFLICT DO NOTHING RETURNING id INTO fid;
    IF fid IS NOT NULL THEN
        INSERT INTO history(flag_id,action,summary,changes) VALUES
            (fid,'flag.created','创建预发布演示 Flag',jsonb_build_object('key','checkout_v2','environment','staging','enabled',true,'default_value',true));
    END IF;
    INSERT INTO flags(name,key,environment,enabled,default_value)
    VALUES ('智能搜索','smart_search','development',false,false)
    ON CONFLICT DO NOTHING RETURNING id INTO fid;
    IF fid IS NOT NULL THEN
        INSERT INTO history(flag_id,action,summary,changes) VALUES
            (fid,'flag.created','创建开发环境演示 Flag',jsonb_build_object('key','smart_search','environment','development','enabled',false,'default_value',false));
    END IF;
END $$;
