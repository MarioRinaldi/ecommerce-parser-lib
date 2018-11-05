var AssineJaParser = function(options, callback) {
    var privateData = {},
        publicData = {},
        defaultConditions,
        inst = this;

    this.init = function() {
        if (options.dataFile === undefined || callback === undefined) { return false; }

        defaultConditions = {
            dcc                 : options.dcc !== undefined                 ? String(options.dcc)                   == "true" : true,
            confort             : options.confort !== undefined             ? String(options.confort)               == "true" : true,
            fidelity            : options.fidelity !== undefined            ? String(options.fidelity)              == "true" : true,
            subscriber          : options.subscriber !== undefined          ? String(options.subscriber)            == "true" : true,
            digitalInvoice      : options.digitalInvoice !== undefined      ? String(options.digitalInvoice)        == "true" : true,
            portability         : options.portability !== undefined         ? String(options.portability)           == "true" : true,
            portabilityMobile   : options.portabilityMobile !== undefined   ? String(options.portabilityMobile)     == "true" : true
        };

        var defaults = {
            data : {
                isClaro           : options.isClaro,
                tvEmptyId         : 0,
                internetEmptyId   : 0,
                foneEmptyId       : 0,
                celularEmptyId    : 0,
                foneBaseId        : 1, //Combo com qqr fone
                celularBaseId     : 1, //Combo com qqr celular
                dataFile          : options.dataFile
            },
            cart : {
                conditions : defaultConditions
            }
        };

        _.extend(data, defaults.data);
        _.extend(cart, defaults.cart, new SelectIds(options));

        publicData = {
            version: '1.1.9',
            cart : cart,
            data : data
        };

        if(options.initUpselling) {
            data.initUpselling(function(){
                inst.getData(callback);
            });
        } else {
            inst.getData(callback);
        }

        return true;
    };

    this.getData = function(callback) {
        var dataTimestamp = new Date();
        var timestamp = [dataTimestamp.getFullYear(), dataTimestamp.getMonth() + 1, dataTimestamp.getDate(), dataTimestamp.getHours(), (dataTimestamp.getMinutes() < 30 ? '00' : '30' )].join('');

        $.ajax({
            url : data.dataFile,
            data: {timestamp: timestamp},
            cache: true,
            dataType : 'jsonp',
            jsonpCallback: 'parseResponse',
            async: false,
            type : 'POST',
            contentType : "application/x-www-form-urlencoded; charset=iso-8859-1",
            beforeSend : function(xhr) {
                xhr.setRequestHeader('Accept', "application/x-www-form-urlencoded; charset=iso-8859-1");
            },
            success : function(jsonData, textStatus, jqXHR) {
                _.extend(data, jsonData.data);
                _.extend(privateData,_.omit(jsonData, ['data']));

                data.city = !!options.cidadeNome && options.cidadeNome || '';
                data.uf = !!options.uf && options.uf || '';
                data.selo = jsonData.data.seloId && jsonData.extras.selos[jsonData.data.seloId];

                _.each(['tv','internet','fone','celular'], function(productType) {
                    data['has' + productType] = jsonData.produtos[productType] && (!!_.find(jsonData.produtos[productType], function(product) { return !product.somenteCombo; }));
                });

                data.hascombo = jsonData.combo && (!!_.find(jsonData.combo, function(combo) { return !!combo.exibir; }));

                data.hascombomulti = jsonData.combo && (!!_.find(jsonData.combo, function(combo) {
                    return !!combo.exibir && (!!combo.celularId || !!combo.tagAdditionalIds && hasTags(combo.tagAdditionalIds,'combo-multi'));
                }));

                cart.addSelection(cart); // [[TODO]] Verificar se for ids diferentes de zero!

                if (!!callback) { callback.call(publicData); }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('error:', jqXHR, textStatus, errorThrown);
            }
        });
    };

    function toCurrency (value) {
        value = value.toString();

        return (value > 99999) ? value.replace(/(\d+)(\d{3})(\d{2})$/, "$1.$2,$3") :
               (value < 10) ? '0,0' + value : (value < 100) ? '0,' + value :
               value.replace(/(\d+)(\d{2})$/, "$1,$2");
    }

    function SelectIds(baseSelection) {
        var idsCombo = baseSelection.comboId && baseSelection.comboId.split('_') || [],
            selectIds = (!!baseSelection.comboId || !!baseSelection.tvId || !!baseSelection.internetId || !!baseSelection.foneId || !!baseSelection.celularId) ? {
                tvId        : parseInt(idsCombo[0] || baseSelection.tvId        || data.tvEmptyId, 10),
                internetId  : parseInt(idsCombo[1] || baseSelection.internetId  || data.internetEmptyId, 10),
                foneId      : parseInt(idsCombo[2] || baseSelection.foneId      || data.foneEmptyId, 10),
                celularId   : parseInt(idsCombo[3] || baseSelection.celularId   || data.celularEmptyId, 10)
            } : undefined;

        if (baseSelection.comboId) {
            selectIds.comboId = baseSelection.comboId;
        }

        return selectIds;
    }

    function getProduct(itemType, rawItem, selectionIds, conditions) {
        if (typeof(rawItem) === "object") {
            conditions   = _.extend({}, cart.conditions, conditions);
            rawItem = calculateProduct(itemType, rawItem, selectionIds, conditions);

            var badges = privateData.extras && privateData.extras.selos && privateData.extras.selos[rawItem.seloId];
            if (badges) {
                rawItem.selos = badges;
            }

            if (rawItem.tagIds && privateData.tags) { //hasTags
                rawItem.tags = _.chain(rawItem.tagIds).map(function(tagId) {
                    return privateData.tags[tagId];
                }).compact().value();
            }

            if (rawItem.adicionaisIds && privateData.adicionais && privateData.adicionais.grupos && privateData.adicionais.opcoes) { //hasAdditional
                var additionalItem = {};
                _.each(rawItem.adicionaisIds,function(adicionaisId) {
                    var adicional = privateData.adicionais.grupos[adicionaisId], opcoes;

                    if ('undefined' !== typeof adicional) {
                        opcoes = _.chain(adicional.opcoes).map(function(opcaoId) {
                            var opcao = data.getAdditionalById(opcaoId);
                            _.extend(opcao, {
                                'tvAdicional': adicional.tvAdicional || 0,
                                'multipleChoice': adicional.multipleChoice || 0
                            });
                            if (!adicional.multipleChoice) {
                                opcao.otherOptions = _.without(adicional.opcoes, opcaoId);
                            }
                            return opcao;
                        }).value();

                        additionalItem[adicionaisId] = {
                            nome: adicional.nome,
                            id: adicional.id,
                            opcoes: opcoes,
                            tvAdicional: adicional.tvAdicional || 0,
                            required: adicional.required || 0,
                            multipleChoice: adicional.multipleChoice || 0
                        };
                    }
                });
                rawItem.adicionais = additionalItem;
            }

            if (rawItem.canaisIds && privateData.canais) { //hasCanais
                rawItem.listaCanais = _.map(rawItem.canaisIds, function(canalId) {
                    return data.getCanal(canalId);
                });
                rawItem.canais = _.size(rawItem.listaCanais || []);
            }

            if (rawItem.canaisPrincipaisIds && privateData.canais) { //hasCanaisPrincipais
                rawItem.canaisPrincipais = _.chain(rawItem.canaisPrincipaisIds).sortBy('canalId').map(function(canalId) {
                    var canal = data.getCanal(canalId);
                    return !!canal && !!canal.id  ? canal : undefined;
                }).compact().value();
            }

            if (rawItem.recursosIds && privateData.extras && privateData.extras.tabelasDeAtributos &&  privateData.extras.tabelasDeAtributos.atributos ) { //hasRecursos
                rawItem.recursos = _.chain(rawItem.recursosIds).map(function(recursoId) {
                    return privateData.extras.tabelasDeAtributos.atributos[recursoId];
                }).compact().value();
            }

            if (rawItem.tabelaId && privateData.extras.tabelasDeAtributos && privateData.extras.tabelasDeAtributos.tabelas && privateData.extras.tabelasDeAtributos.atributos) {
                var tabelasDeAtributos = privateData.extras.tabelasDeAtributos,
                    atributos = tabelasDeAtributos.atributos,
                    tabela = tabelasDeAtributos.tabelas[rawItem.tabelaId];

                if (tabela) {
                    rawItem.tabelaDeAtributos = {};
                    for (var attr in tabela) {
                        var atributo = (atributos) ? atributos[attr] : false,
                            categoria = (atributo && atributo.categoriaId) ? tabelasDeAtributos.categorias[atributo.categoriaId] : "Outros",
                            obj = {};

                        if (!atributo || !categoria) {
                            continue;
                        }
                        if (!rawItem.tabelaDeAtributos[categoria]) {
                            rawItem.tabelaDeAtributos[categoria] = {};
                        }

                        obj = {
                            "descricao" : atributo.descricao,
                            "destaque" : atributo.destaque,
                            "valor" : tabela[attr]
                        };

                        rawItem.tabelaDeAtributos[categoria][atributo.nome] = obj;

                    }
                }
            }
            if (rawItem.hasOferta && !!privateData.extras.ofertaTextos && !!privateData.extras.ofertaTextos[itemType]) {
                var selection = _.object([itemType], [rawItem]);
                rawItem.oferta = getOferta(selection);
            }

            var productAttibutes = ['adesao','id','taxaInstalacao','nome','oferta','preco','precoDe','canais','vantagens','somenteCombo','somentePortabilidade','selos','tags','adicionais','canaisPrincipais','listaCanais','recursos','recursos_descritivos','cabecalho','ate','tabelaDeAtributos','exibir','ordem','somentePJ','ofertaPortabilidadeCelular'];
            if (!!rawItem.periodos && rawItem.periodos.length > 0) { productAttibutes.push('periodos'); }
            if (itemType !== "combo" && itemType !== "selecoes") { productAttibutes.push('adesaoParcelas','adesaoPrePaga'); }

            return _.pick(rawItem, productAttibutes);
        }

        return undefined;
    }

    function setPeriodos(ofertas, prices) {
        var conditions = cart.conditions;
        var len = _.size(ofertas);
        var last = _.last(ofertas);
        if (len === 0) { return prices; }
        prices = prices || [];
        for (var l = last.ate - 1; l>=0; l--) {
            prices[l] = last.preco;
        }
        ofertas.pop();
        return setPeriodos(ofertas,prices);
    }

    // calculo individual de periodos.
    // verifica se há 1 periodo, senao pega valor "default", (se for dum combo, não tem id)
    function calculatePeriodos (rawItem, options) {
        var periodos = rawItem.periodos || [],
            periodos_ = false,
            portability = false,
            ofertas = [];

        options =  options || {};

        if (!!options.ofertas) {
            ofertas = _.toArray(options.ofertas);
            periodos_ = setPeriodos(ofertas);
        }
        if (!!options.conditions && !!(options.itemType === 'celular' || options.itemType === 'fone')) {
            portability = options.conditions[(options.itemType === "fone" ? 'portability' : 'portabilityMobile')];
        }


        for (var mes = periodos.length ; mes < 13; mes++) {
            var preco = 0;
            if (options.itemType === 'fone' || options.itemType === 'celular') {
                preco +=  (!portability && rawItem.acrescimoNaoPN !== undefined) ? rawItem.acrescimoNaoPN : 0;
            }

            if (!!periodos_ && _.isNumber(periodos_[mes])) {
                preco += periodos_[mes];
                periodos.push(preco);
            } else {
                if (rawItem.acrescimoNaoDCCFD !== undefined && rawItem.acrescimoNaoDCCFD > 0 && (!options.conditions.dcc || !options.conditions.digitalInvoice)) {
                    preco += rawItem.acrescimoNaoDCCFD;
                } else {
                    preco += (rawItem.acrescimoNaoDCC !== undefined && !options.conditions.dcc) ? rawItem.acrescimoNaoDCC : 0;
                    preco += (rawItem.acrescimoNaoFD !== undefined && !options.conditions.digitalInvoice) ? rawItem.acrescimoNaoFD : 0;
                }
                if (!rawItem.id) {
                    preco += rawItem.preco || 0;
                    periodos.push(preco);
                } else if (!!rawItem.id) {
                    preco += rawItem.precoDe || 0;
                    periodos.push(preco);
                }
            }
        }
        return periodos;
    }

    function calculateProduct(itemType, rawItem, selectionIds, conditions) {
        var product = _.clone(rawItem);

        if (product) {
            selectionIds = selectionIds || cart;

            var selectedIds = new SelectIds(selectionIds);
            var deal;
            selectedIds[itemType + "Id"] = product.id;
            var ofertas = privateData.ofertas && privateData.ofertas[product.ofertaId];

            // [[TODO]] talvez dê problema para saber o valor single mais caro.
            if ( product.precoDe === undefined && product.preco !== undefined) { product.precoDe = product.preco; }

            if (ofertas && conditions.fidelity) { //calcula oferta correta
                var subscriber          = conditions.subscriber         ? 'c' : 'p', // Cliente ou não cliente?      (Default: não cliente P)
                    confort             = conditions.confort            ? 'f' : 'b', // Conforto ou básico?          (Default: conforto F )
                    dcc                 = conditions.dcc                ? 'd' : 'n', // DCC ou boleto?               (Default: DCC D)
                    digitalInvoice      = conditions.digitalInvoice     ? 'd' : 'i', // Fatura digital ou impressa?  (Default: digital D)
                    dealType            = subscriber + confort + dcc + digitalInvoice;

                deal = ofertas[dealType];

                if (deal) {
                    product.hasOferta = true;
                    if (deal.periodo) {
                        product.periodos = calculatePeriodos(product, {'conditions': conditions, 'ofertas': deal.periodo, 'itemType': itemType});
                        _.extend(product, deal.periodo[0]);
                    }
                }
            }

            if (!deal || !deal.periodo) {
                product.periodos = calculatePeriodos(product, {'conditions': conditions, 'itemType': itemType});
            }

            if (product.periodos) {
                product.ate = (function() {
                    var i = 0,
                        periodos = product.periodos;
                    while (i <= 12 && periodos[i] === periodos[0]) i++;
                    return (i < 13) ? i : '';
                }());
           }

            if (product.acrescimoNaoDCCFD !== undefined && product.acrescimoNaoDCCFD > 0 && (!conditions.dcc || !conditions.digitalInvoice)) { //acrescenta acrescimo de boleto e Fatura impressa de acordo com a condição
                if ((!deal || !deal.periodo) && product.preco !== undefined) { product.preco += product.acrescimoNaoDCCFD; }
                if (product.precoDe !== undefined) { product.precoDe += product.acrescimoNaoDCCFD; }
            } else {
                if (!conditions.dcc && product.acrescimoNaoDCC !== undefined) { //acrescenta DCC de acordo com a condição
                    if ((!deal || !deal.periodo) && product.preco !== undefined) { product.preco += product.acrescimoNaoDCC; }
                    if (product.precoDe !== undefined) { product.precoDe += product.acrescimoNaoDCC; }
                }

                if (!conditions.digitalInvoice && product.acrescimoNaoFD !== undefined) { //acrescenta acrescimo de Fatura impressa de acordo com a condição
                    if ((!deal || !deal.periodo) && product.preco !== undefined) { product.preco += product.acrescimoNaoFD; }
                    if (product.precoDe !== undefined) { product.precoDe += product.acrescimoNaoFD; }
                }
            }

            if (product.adesao !== undefined && (!conditions.fidelity && product.adesaoNaoFidelidade !== undefined)) {
                product.adesao = product.adesaoNaoFidelidade;
            }

            if (product.adesao !== undefined && product.adesaoAcrescimoNaoDCC !== undefined && !conditions.dcc) {
                product.adesao += product.adesaoAcrescimoNaoDCC;
            }

            if (product.acrescimoNaoPN !== undefined && ((itemType === "fone" && !conditions.portability) || (itemType === "celular" && !conditions.portabilityMobile))) {
                if (product.preco   !== undefined) { product.preco   += product.acrescimoNaoPN; }
                if (product.precoDe !== undefined) { product.precoDe += product.acrescimoNaoPN; }
            }

            if (!conditions.fidelity) {
                product.adesaoParcelas = 1;
            }

            var joinedIds = [selectedIds.tvId, selectedIds.internetId, selectedIds.foneId];
            if (!!selectedIds.celularId) {
                joinedIds.push(selectedIds.celularId);
            }
            joinedIds = joinedIds.join('_');

            var tmpSelection = _.clone(privateData.selecoes[joinedIds]);
            if (itemType !== "selecoes" && tmpSelection && tmpSelection[itemType]) { //Verifica se tem seleção
                tmpSelection[itemType].precoDe = product.precoDe;
                var calculatedSelection = calculateProduct(itemType, tmpSelection[itemType], selectedIds, conditions);
                _.extend(product, calculatedSelection);
            }

            if (selectedIds.tvId != data.tvEmptyId && selectedIds.internetId != data.internetEmptyId && selectedIds.foneId != data.foneEmptyId) { //Se tiver os 3 produtos
                var tmpCombo = _.clone(privateData.combo[joinedIds]);
                if (itemType !== "combo" && tmpCombo && tmpCombo[itemType]) { //Verifica se "comba"
                    tmpCombo[itemType].precoDe = product.precoDe;
                    var calculatedCombo = calculateProduct(itemType, tmpCombo[itemType], selectedIds, conditions);
                    _.extend(product, calculatedCombo);
                }
            }
            return product;
        } else {
            return undefined;
        }
    }

    function getTagId(tagName) {
        var tagId;
        if (tagName) {
            _.each(privateData.tags, function(name, id) { if (name == tagName) {tagId = Number(id); } } );
        }
        return tagId;
    }

    function hasTags(productTagIds, tagNames) {
        return _.chain(tagNames.split(',')).map(function(tag) {
            return _.include(productTagIds, getTagId(tag));
        }).include(false).value() !== true;
    }
    function getOferta(selection) {
        var oferta,
            combinacao = selection.combo || selection.selecoes;
        var txtOferta = function(tpl,productInfo) {
                return tpl && (tpl).replace(/{{\s?([^\s]+)\s?}}/g,function(matchString, matchGroup){
                    return productInfo[matchGroup];
                });
            };

        if (!privateData.extras.ofertaTextos) { return false; }

        if (combinacao) {
            var periodos = cart.getPeriodos(selection),
                primeiroPeriodo = periodos[0],
                ultimoPeriodo = _.last(periodos),
                comboProductInfo = {
                    nome        : combinacao.nome,
                    preco       : 'R$ ' + toCurrency(primeiroPeriodo.atual),
                    precoDe     : ultimoPeriodo && ultimoPeriodo.atual && ('R$ ' + toCurrency(ultimoPeriodo.atual)),
                    precoApos   : ultimoPeriodo && ultimoPeriodo.atual && ('R$ ' + toCurrency(ultimoPeriodo.atual)),
                    periodo     : !primeiroPeriodo.ultimoMes || primeiroPeriodo.ultimoMes === '1' ? '1 mês' : (primeiroPeriodo.ultimoMes + ' meses')
                };

            oferta = txtOferta(privateData.extras.ofertaTextos.combinado, comboProductInfo);
        } else {
            oferta = _.chain(selection).map(function(product, itemType) {
                var tplSingle = privateData.extras.ofertaTextos[itemType],
                    obj = _.object([itemType], [{'periodos':product.periodos}]),
                    periodos = cart.getPeriodos(obj, {ignoreAdditionals:1}),
                    primeiroPeriodo = periodos[0],
                    ultimoPeriodo = _.last(periodos),
                    productInfo = (function() {
                            return {
                                nome : product.nome && product.nome.trim(),
                                preco : 'R$ ' + toCurrency(primeiroPeriodo.atual),
                                precoApos : ultimoPeriodo && ultimoPeriodo.atual && ('R$ ' + toCurrency(ultimoPeriodo.atual)),
                                periodo : !primeiroPeriodo.ultimoMes || primeiroPeriodo.ultimoMes === '1' ? '1 mês' : (primeiroPeriodo.ultimoMes + ' meses')
                            };
                        })();

                if (periodos.length === 1) {
                    tplSingle = '{{nome}}: pague {{preco}}';
                }

                return '<div>'+txtOferta(tplSingle,productInfo) + '</div>';
            }).first().value();
        }
        return oferta;
    }

    var data = {
        filterProduct : function(productType, tagNames, options) {
            var products = [],
                comboMultiId = getTagId('combo-multi'),
                isFoneSingle = !!(productType == 'fone' && (!cart.selection || !cart.selection.tv && !cart.selection.internet)), //[RR] Nao tenho certeza se isto está de acordo com as regras
                defaults = {};

            options = _.extend(defaults, options || {});

            var productBaseId = data[productType + 'BaseId'],
                isBase  = !!cart.selection && !!cart.selection[productType] && cart.selection[productType].id == productBaseId,
                selecaoIds = _.pick(cart,['tvId', 'internetId', 'foneId', 'celularId']),
                isCombo = !!cart.selection && !!cart.selection.combo;

            _(privateData.produtos[productType]).chain()
                .filter(function(product) {
                    selecaoIds[productType+'Id'] = product.id;
                    var joinedIds = [selecaoIds.tvId, selecaoIds.internetId, selecaoIds.foneId];
                    if (!!selecaoIds.celularId) { joinedIds.push(selecaoIds.celularId); }
                    var canBeCombo = data.foneBaseId !== selecaoIds.foneId && (!selecaoIds.celularId || data.celularBaseId !== selecaoIds.celularId) && privateData.combo[joinedIds.join('_')]; // combinação do cart.selection com o produto esperado

                    return  (!!options.showAll || (product.exibir === undefined || !!product.exibir )) &&
                            (!product.somenteCombo || !!canBeCombo || isCombo && isBase && product.id != productBaseId) && //[RR] Nao tenho certeza se isto está de acordo com as regras
                            (!(isFoneSingle && _.include(product.tagIds, comboMultiId))) &&
                            (!tagNames || hasTags(product.tagIds, tagNames)) &&
                            (!options.inIds || _.contains(options.inIds, product.id));

                }).each(function(product) {
                    var selectionIds = cart.comboId ? {} : cart,
                        selectedIds  = new SelectIds(selectionIds),
                        item = data.getProductById(productType, product.id, selectedIds);
                    if (item) {
                        products.push(item);
                    }
                });

            return _.sortBy(products, 'ordem');
        },

        /**
         * @name filterCombos
         * @description filtrar combos do json
         * @param  {json} options
         * @return {[array]}
         *
         * options = {
         *      'showAll' : '(bool) desativa filtros (tags, exibir, etc)',
         *      'selections' : '(bool) incluir seleções (double e triple) aos combos',
         *      'tagsCombo' : '(array) filtrar combos que usam tais tags ',
         *      'tagsProduct' : '(array) filtrar combos que os produtos usam tais tags ',
         *      'context': '(json) filtra combos com um produto especifico (ex.: {'tvId':0,'internetId':0,'foneId':0}',
         *      'multi' : '(bool) caso passado 1 retorna apenas combos multi, caso passado 0 retorna apenas combo (sem celular), caso não passado retorna todos (com e sem celular, DEFAULT),
         *      'orderBy': '(string) ordena os combos de acordo com o parametro (ordem, DEFAULT)
         * }
         *
         */
        filterCombos : function (options) {
            var combos = [],
                defaults = {
                    orderBy: 'ordem',
                    multi: null
                };

            options = _.extend(defaults, options || {});

            var products = !!options.selections    ? _.extend({},privateData.selecoes, privateData.combo) :
                           !!options.onlySelection ? privateData.selecoes : privateData.combo;

            _.chain(products).filter(function(product) {
                return (
                    // Filtra combos/selecoes conforme o contexto de tv/internet/fone/celular
                    (!options.context || ((!options.context.tvId || product.tvId && parseInt(options.context.tvId,10) === product.tvId ) && (!options.context.internetId || product.internetId && parseInt(options.context.internetId,10) === product.internetId ) && (!options.context.foneId || product.foneId && parseInt(options.context.foneId,10) === product.foneId ) && (!options.context.celularId || product.celularId && parseInt(options.context.celularId,10) === product.celularId ))) &&

                    // Filtra combos/selecoes com exibir == 1 quando não passar parametro
                    (!!options.showAll || !!product.exibir) &&

                    // Filtra combo multi ou combo
                    (options.multi === null || (!!parseInt(options.multi,2) === Boolean(product.celularId))) &&

                    // Filtra combos/selecoes com as tags
                    (!options.tagsCombo || !!product.tagIds && hasTags(product.tagIds, options.tagsCombo)) &&

                    // Filtra combos/selecoes com os produtos que tenham as tags
                    (!options.tagsProduct || !!product.tagAdditionalIds && hasTags(product.tagAdditionalIds, options.tagsProduct))
                );
            }).each(function(product){
                if (!!product.combos) { // [[OBS]] Esse atributo era originalmente usado apenas como DEBUG, lembrar que não pode mais remover do JSON
                    product.comboId = product.id;
                }
                var tmpProduct  = data.getSelection(product);

                if (tmpProduct) {
                    combos.push(tmpProduct);
                }
            });

            return _.sortBy(combos, function(combinacao) {
                var combinado = combinacao.combo || combinacao.selecoes;
                return combinado[options.orderBy] || 99999;
            });
        },

        /**
         * @name FilterSelections
         * @description filtra as seleções do json
         * @param  {json} options
         * @return {array}
         */
        filterSelections: function(options) {
            options = _.extend(options || {}, { onlySelection: true });
            return data.filterCombos(options);
        },

        /**
         * @name filterAll
         * @description filtrar combos, seleções e produtos do json
         * @param  {json} options
         * @return {[type]}
         *
         * options = {
         *      'showAll' : '(bool) desativa filtros (tags, exibir, etc)',
         *      'selections' : '(bool) incluir seleções (double e triple) aos combos',
         *      'tags' : '(array) filtrar combos e seleções e produtos que usam tais tags ',
         * }
         *
         */
        filterAll: function(options) {
            var defaults = {
                showAll: false,
                selections: true
            };

            options = _.extend(defaults, options || {});

            var products = {
                    'combo' : data.filterCombos({tagsCombo:options.tags, showAll: options.showAll, selections: options.selections}),
                    'tv' : data.filterProduct('tv', options.tags, {showAll:options.showAll}),
                    'internet' : data.filterProduct('internet', options.tags, {showAll:options.showAll}),
                    'fone' : data.filterProduct('fone', options.tags, {showAll:options.showAll}),
                    'celular' : data.filterProduct('celular', options.tags, {showAll:options.showAll})
                },
                result = [];


            _.each(['tv','internet','fone','celular'], function(type) {
                var _result = _.map(products[type],function(product) {
                    product.type = type;
                    return product;
                });
                result = _.union(result, _result);
            });

            result = _.union(result, _.map(products.combo,function(product) {
                var productType = (product.combo) ? 'combo' : 'selecoes';
                _.extend(product, product[productType]);
                product = _.omit(product, [productType]);
                product.type = productType;
                return product;
            }));

            return result || [];
        },

        getProductById : function(productType, productId, selectionIds, conditions) {
            return privateData.produtos[productType] && privateData.produtos[productType][productId] && getProduct(productType, privateData.produtos[productType][productId], selectionIds, conditions);
        },

        getComboById : function(comboId) {
            var combinacao = data.getSelection({comboId:comboId});
            return combinacao.combo ? combinacao : undefined;
        },

        getSelection : function(selectedIds) {
            var selection = {};

            selectedIds = SelectIds(selectedIds);

            if (!!selectedIds) {
                _.each(['tv','internet','fone','celular'], function(productType) {
                    if (selectedIds[productType+'Id'] != data[productType+'EmptyId']) {
                        var product = data.getProductById(productType, selectedIds[productType+'Id'], selectedIds);
                        if (product) {
                            selection[productType] = product;
                        }
                    }
                });
            }

            var selectionIds = _.object(['tvId','internetId','foneId','celularId'], [selection.tv && selection.tv.id, selection.internet && selection.internet.id, selection.fone && selection.fone.id, selection.celular && selection.celular.id ]);

            var validateSelection = function(productIds) {
                return !!productIds && (
                    (!selectionIds.tvId && !productIds.tvId || selectionIds.tvId == productIds.tvId) &&
                    (!selectionIds.internetId && !productIds.internetId || selectionIds.internetId == productIds.internetId) &&
                    (!selectionIds.foneId && !productIds.foneId || selectionIds.foneId == productIds.foneId) &&
                    (!selectionIds.celularId && !productIds.celularId || selectionIds.celularId == productIds.celularId)
                );
            };

            var isValidSelection = validateSelection(selectedIds); // verifica se os produtos retornados são os mesmos ids passados para função getSelection
            if (isValidSelection) {

                var getCombinacao = function(itemType) {
                    var conditions = itemType === 'combo' ? _.defaults({ fidelity : true }, cart.conditions) : cart.conditions;

                    var combinacao = itemType === 'combo' && !!selectedIds.comboId && privateData.combo && privateData.combo[selectedIds.comboId] || _.find(privateData[itemType],function(product) {
                            return validateSelection(product); // retorna combo/seleção de acordo com os IDs;
                        });
                    return !!combinacao && getProduct(itemType, combinacao, combinacao, conditions);
                };

                var tmpCombo = getCombinacao('combo');
                if (tmpCombo) {
                    var tvIds = _.chain(privateData.combo).filter(function(tmpItem) {
                        return (!selectionIds.tvId && !tmpItem.tvId || selectionIds.tvId && selectionIds.tvId !== tmpItem.tvId) &&
                               (!selectionIds.internetId && !tmpItem.internetId || selectionIds.internetId && selectionIds.internetId == tmpItem.internetId) &&
                               (!selectionIds.foneId && !tmpItem.foneId || selectionIds.foneId && selectionIds.foneId == tmpItem.foneId) &&
                               (!selectionIds.celularId && !tmpItem.celularId || selectionIds.celularId && selectionIds.celularId == tmpItem.celularId);
                    }).pluck('tvId').unique().compact().value(); // [[TODO]] verificar se é otimizavel

                    if (tvIds.length > 0) {
                        tmpCombo.tvIds = tvIds.sort();
                    }

                    var foneIds = _.chain(privateData.combo).filter(function(tmpItem) {
                        return (!selectionIds.tvId && !tmpItem.tvId || selectionIds.tvId && selectionIds.tvId == tmpItem.tvId) &&
                               (!selectionIds.internetId && !tmpItem.internetId || selectionIds.internetId && selectionIds.internetId == tmpItem.internetId) &&
                               (!selectionIds.celularId && !tmpItem.celularId || selectionIds.celularId && selectionIds.celularId == tmpItem.celularId) &&
                               (!selectionIds.foneId || !!tmpItem.foneId && selectionIds.foneId !== tmpItem.foneId && tmpItem.foneId !== data.foneBaseId);
                    }).pluck('foneId').unique().compact().value(); // [[TODO]] verificar se é otimizavel

                    if (foneIds.length > 0) {
                        tmpCombo.foneIds = foneIds.sort();
                    }

                    var celularIds = _.chain(privateData.combo).filter(function(tmpItem) {
                        return (!selectionIds.tvId && !tmpItem.tvId || selectionIds.tvId && selectionIds.tvId == tmpItem.tvId) &&
                               (!selectionIds.internetId && !tmpItem.internetId || selectionIds.internetId && selectionIds.internetId == tmpItem.internetId) &&
                               (!selectionIds.foneId && !tmpItem.foneId || selectionIds.foneId && selectionIds.foneId == tmpItem.foneId) &&
                               (!selectionIds.celularId || !!tmpItem.celularId && selectionIds.celularId !== tmpItem.celularId && tmpItem.celularId !== data.celularBaseId );
                    }).pluck('celularId').unique().compact().value(); // [[TODO]] verificar se é otimizavel

                    if (celularIds.length > 0) {
                        tmpCombo.celularIds = celularIds.sort();
                    }

                    tmpCombo.desmembravel = ((!!selection.tv && !selection.tv.somenteCombo) && (!!selection.internet && !selection.internet.somenteCombo) && (selectionIds.foneId != data.foneBaseId && !selection.fone.somenteCombo && !!tmpCombo.foneIds) && (!selection.celular || selectionIds.celularId != data.celularBaseId && !selection.celular.somenteCombo && !!tmpCombo.celularIds) ); // [[TODO]] verificar se é otimizavel

                    selection.combo = tmpCombo;
                } else {
                    var tmpSelection = getCombinacao('selecoes');
                    if (tmpSelection) {
                        tmpSelection.desmembravel = true;
                        selection.selecoes = tmpSelection;
                    }
                }

                var item = selection.combo || selection.selecoes;
                if (item) {
                    item.nome           = _.compact([(selection.tv ? selection.tv.nome : null), (selection.internet ? selection.internet.nome : null), (selection.fone ? selection.fone.nome : null), (selection.celular ? selection.celular.nome : null)]).join(" + ");
                    item.preco          = cart.getMontly(selection, {ignoreAdditionals: true});
                    item.precoDe        = cart.getMontlyFrom(selection, {ignoreAdditionals: true});
                    item.adesao         = cart.getSignup(selection, {ignoreAdditionals: true});
                    item.taxaInstalacao = cart.getInstallation(selection, {ignoreAdditionals: true});
                    item.periodos       = cart.getPeriodos(selection,{ignoreAdditionals: true});

                    if (item.periodos && item.periodos[0] && item.periodos[0].ultimoMes) {
                        item.oferta     = getOferta(selection);
                    }
                }
            }

            return isValidSelection && (!selectedIds.comboId || !!selection.combo) && selection;
        },

        getCategoria : function(categoriaId) {
            if (privateData.extras && privateData.extras.categorias) {
                return privateData.extras.categorias[categoriaId];
            }
        },

        getPrivateData: function() {
            console.log('privateData', privateData);
            return false;
        },

        getRecursosPadrao: function(itemType) {
            var extras = privateData.extras;
            if (extras && extras.recursos_padrao && extras.tabelasDeAtributos && extras.tabelasDeAtributos.atributos) {

                var recursos_padrao = extras.recursos_padrao[itemType] || [];
                var recursosPadrao = _.chain(recursos_padrao).map(function (id) {
                    return extras.tabelasDeAtributos.atributos[id].nome;
                }).compact().value();
                return recursosPadrao;
            }
            return [];
        },

        getRecursosPadraoIds: function(itemType) {
            if (privateData.extras && privateData.extras.recursos_padrao) {
                return privateData.extras.recursos_padrao[itemType];
            }
            return [];
        },

        getAtributosDestaqueIds: function (itemType) {
            if (!!privateData.extras.tabelasDeAtributos && !!privateData.extras.tabelasDeAtributos.destaques && !!privateData.extras.tabelasDeAtributos.destaques[itemType]) {
                return privateData.extras.tabelasDeAtributos.destaques[itemType];
            }
            return [];
        },

        getAtributosDestaque: function(itemType) {
            var atributos = this.getAtributosDestaqueIds(itemType),
                formatedData = {};

            for (var i = 0, attrL = atributos.length; i < attrL; i++) {
                var atributoId = atributos[i],
                    atributo = privateData.extras.tabelasDeAtributos.atributos[atributoId],
                    categoria = (atributo.categoriaId) ? privateData.extras.tabelasDeAtributos.categorias[atributo.categoriaId] : "Outros";

                if (!atributo.destaque) {
                    continue;
                }

                formatedData[categoria] = formatedData[categoria] ? formatedData[categoria] : [];

                formatedData[categoria].push(atributo.nome);

            }

            return formatedData;

        },

        getCanal: function(canalId) {
            var canal = privateData.canais.lista[canalId] || {},
                categoria = canal.categoriaId ? privateData.canais.categorias[canal.categoriaId] : false;

            if (categoria) {
                canal.categoria = categoria.nome;
            }

            return canal;
        },

        filterCanais: function(categoriaId) {
            return _.chain(privateData.canais.lista).filter(function (canal) {
                return !categoriaId || canal.categoriaId === categoriaId;
            }).map(function(canal) {
                return data.getCanal(canal.id);
            }).value();
        },

        getCanaisCategorias: function() {
            return privateData.canais.categorias || [];
        },
        getCanaisByTvId: function(tvId) {
            var categorias = data.getCanaisCategorias();
            var tv = data.getProductById('tv',tvId);
            var listaCanais = {};
            var tvPrivate = privateData.produtos.tv[tvId];

            if (!tv) { return false; }

            _.chain(categorias).sortBy(function(categoria){
                    return categoria.nome;
                }).each(function(categoria) {
                    var listaCanaisPorCategoria = _.filter(tv.listaCanais, function(canal){return canal.categoriaId == categoria.id;});
                    if (_.size(listaCanaisPorCategoria)) {
                        listaCanais[categoria.nome] = listaCanaisPorCategoria;
                    }
                });

            return listaCanais;
        },

        // [[TODO]] melhorar essa função
        getAdditionalById: function(additionalId) {
            additionalId = (additionalId).toString();
            var adicional = privateData.adicionais && privateData.adicionais.opcoes ? privateData.adicionais.opcoes[additionalId] : false;

            if (!adicional) { return false; }

            adicional = getProduct('adicional', adicional, {});

            if (privateData.adicionais.opcoes[additionalId] && privateData.adicionais.opcoes[additionalId].categoriaId) {
                adicional.categoria = data.getCategoria(privateData.adicionais.opcoes[additionalId].categoriaId);
            }

            return _.omit(adicional, ['categoriaId', 'oferta']);
        },

        getLowestPrice: function (itemType, productId, options) {
            options = options || {multi: undefined}; // undefined, 0 ou 1
            var combo, produto;
            productId = parseInt(productId,10);

            combo = _.chain(privateData.combo).filter(function(combinacao) {
                    return (
                        ('undefined' === typeof options.multi || !!options.multi === !!combinacao.celularId) &&
                        (combinacao[itemType] && productId === combinacao[itemType + 'Id']) &&
                        (!!combinacao.tv && combinacao.tv.id !== data.tvEmptyId) &&
                        (!!combinacao.internet && combinacao.internet.id !== data.internetEmptyId) &&
                        (!!combinacao.fone && combinacao.fone.id !== data.foneEmptyId && !!combinacao.fone && combinacao.fone.id !== data.foneBaseId) &&
                        (!combinacao.celular || combinacao.celular.id !== data.celularEmptyId && combinacao.celular.id !== data.celularBaseId)
                    );
                }).map(function(combinacao) {
                    var p = calculateProduct(itemType, combinacao[itemType], {}, defaultConditions);
                    p.comboReferenceId = combinacao.id;
                    return p;
                }).sortBy('preco').first().value() || {};

            produto = ("undefined" !== typeof combo.preco && combo || (data['has'+itemType] && !!privateData.produtos[itemType][productId] && calculateProduct(itemType, privateData.produtos[itemType][productId], cart, cart.conditions)));

            var periodo = (function() {
                var selection = {}, periodos, periodo;
                selection[itemType] = produto;
                periodos = cart.getPeriodos(selection);
                periodo = _.first(periodos);
                return !!periodo && !!periodo.ultimoMes && parseInt(periodo.ultimoMes,10);
            })();
            return !!produto && {preco: produto.preco, precoDe: !!produto.periodos && _.last(produto.periodos) || produto.precoDe, comboReferenceId: produto.comboReferenceId, ate: !!periodo && periodo } || undefined;
        },

        initUpselling : function(callback, url){
            callback = callback || function(){};

            if(!privateData.upselling) {

                var url = !options ? url :
                    options.dataPath + (options.empresas ? 'empresas' : 'residencial') + '/' + (options.company === "claroTv" ? ("claro/" + options.grupo) : ("net/" + options.cidade)) + '_upselling'  + '.json';

                return usp.init(url, function(uspData) {
                    privateData.upselling = uspData;
                    return callback(privateData.upselling);
                });
            } else {
                return callback(privateData.upselling);
            }
        },

        getSugestoes : function(productIds, documentType){
            if(!productIds) { throw new TypeError('AssineJaParser::getSugestoes: ProductIds cannot be null'); }

            return data.initUpselling(function(uspData){
                return usp.filterSuggestions(uspData, productIds, function(regras){
                    return !!regras[0] && !!regras[0].sugestoes && data.getSelection(regras[0].sugestoes);
                }, documentType);
            });

        }
    };

    var cart = {
        clear: function() {
            _.each(['tv','internet','fone', 'celular'], function(productType) {
                cart[productType + 'Id'] = data[productType + 'EmptyId'];
            });

            delete cart.comboId;
            delete cart.selection;
            cart.adicionais.clear();
            cart.subprodutos.clear();

            cart.conditions = _.clone(defaultConditions);
        },
        subprodutos: {
            length: 0,
            values: {},
            keys: [],
            add: function(ids) {
                this.values = {};
                var tvAdicional, values = this.values;

                if ('undefined' === typeof ids) {
                    ids = this.keys.length && this.keys || options.subprodutosIds && _.chain(options.subprodutosIds.split(',')).map(function(subprodutoId) {
                        return parseInt(subprodutoId,10);
                    }).compact().value();
                } else {
                    if (!_.isArray(ids)) {
                        ids = !!_.isString(ids) ? [parseInt(ids,10)] : [ids];
                    }
                }
                this.keys = _.union(this.keys,ids);

                _.each(this.keys, function(k) {
                    tvAdicional = cart.subprodutos.getById(k);
                    if (!!tvAdicional) {
                        values[k] = tvAdicional;
                    }
                    return tvAdicional;
                });
                this.length = _.size(this.values);
                this.keys = _.chain(this.values).map(function(valor,chave) {
                        return !!valor && parseInt(chave,10);
                    }).compact().value();
                inst.subprodutosIds = this.keys;
                return true;
            },
            remove: function(ids) {
                ids = ids || this.keys || options.subprodutosIds && _.chain(options.subprodutosIds.split(',')).map(function(subprodutoId) {
                        return parseInt(subprodutoId,10);
                    }).compact().value();
                if (!_.isArray(ids)) {
                    ids = !!_.isString(ids) ? [parseInt(ids,10)] : [ids];
                }
                this.keys = _.difference(this.keys,ids);
                options.subprodutosIds = this.keys.join(',');
                this.add();
            },
            permitidos: function getSubProduct(productId) {
                productId = productId || cart.tvId;
                return _.chain(privateData.selecoesTvAdicional).map(function(selecao) {
                    var hasSubProduct = _.contains(selecao.tvsIds, productId),
                        subprodutosIds = selecao.tvsAdicionaisIds;
                    return !!hasSubProduct && subprodutosIds.length === 1 && cart.subprodutos.getById(subprodutosIds[0]);
                }).compact().value();
            },
            getById: function(id,productType) {
                productType = productType || 'tvAdicional';
                var rawItem = !!privateData.produtos[productType] && privateData.produtos[productType][id];
                if ("object" !== typeof rawItem) { return false; }
                rawItem = cart.subprodutos.calculate(rawItem) || {};

                rawItem.tipo = productType;

                // canais
                if (rawItem.canaisIds && privateData.canais) {
                    rawItem.listaCanais = _.map(rawItem.canaisIds, function(canalId) {
                        return data.getCanal(canalId);
                    });
                    rawItem.canais = _.size(rawItem.listaCanais || []);
                }
                // canais
                if (rawItem.canaisPrincipaisIds && privateData.canais) {
                    rawItem.canaisPrincipais = _.map(rawItem.canaisPrincipaisIds, function(canalId) {
                        return data.getCanal(canalId);
                    });
                }

                return _.isNumber(rawItem.preco) && rawItem.preco >= 0 && _.pick(rawItem, ['id', 'nome', 'ordem', 'descricao', 'descricaoCapa', 'tipo', 'canais', 'listaCanais', 'canaisPrincipais', 'canaisPrincipais', 'preco', 'precoDe', 'prazo', 'periodos','imagens']);
            },
            calculate: function(rawItem) {
                var mes,
                    cartKeys = _.union(this.keys, [rawItem.id]),
                    product = _.extend({},rawItem);

                var valor = _.chain(privateData.selecoesTvAdicional).filter(function(selecao) {
                            return selecao.tvsAdicionais[rawItem.id] && _.contains(selecao.tvsIds, parseInt(cart.tvId,10));
                        }).sortBy(function(selecao) {
                            return 0 - selecao.tvsAdicionaisIds.length;
                        }).filter(function(selecao) {
                            var d = _.difference(selecao.tvsAdicionaisIds, cartKeys),
                                i = _.intersection(selecao.tvsAdicionaisIds, cartKeys);
                            return (i.length === selecao.tvsAdicionaisIds.length || d.length === 0) && !!selecao && !!selecao.tvsAdicionais[rawItem.id] && selecao.tvsAdicionais[rawItem.id];
                        }).first().value(),
                    ofertas = !cart.conditions.subscriber && !!valor && !!valor.tvsAdicionais[rawItem.id] && valor.tvsAdicionais[rawItem.id].ofertas && _.chain(valor.tvsAdicionais[rawItem.id].ofertas).clone().sortBy(function(oferta) {
                            return oferta.ate;
                        }).value();

                product.precoDe = !!valor && valor.tvsAdicionais[rawItem.id].preco;
                product.preco = (!!ofertas && !!ofertas[0] && ofertas[0].preco >= 0) ? ofertas[0].preco : product.precoDe;

                if (!!ofertas) {
                    product.prazo = !!ofertas[0] && !!ofertas[0].ate && ['por', ofertas[0].ate, (ofertas[0].ate > 1 && 'meses' || 'mês')].join(' ');
                    product.periodos = [];
                    var periodos = setPeriodos(ofertas);
                    for (mes = 0; mes < 13; mes++) {
                        product.periodos.push((!!periodos && _.isNumber(periodos[mes]) && periodos[mes] >= 0) ? periodos[mes] : product.precoDe);
                    }
                } else {
                    product.periodos = [];
                    for (mes = 0; mes < 13; mes++) {
                        product.periodos.push(product.preco);
                    }
                }

                return product;
            },
            clear: function() {
                this.values = {};
                this.length = 0;
                this.keys = [];
            }
        },
        adicionais: {
            length: 0,
            values: {},
            keys: [],
            permitidos: function(productType) {
                var id, opcoesPermitidas = [];

                var selection = (!!productType) ? [cart.selection[productType]] : cart.selection;
                _.each(selection, function(produto){
                    if (!!produto && !!produto.adicionais) {
                        _.each(produto.adicionais, function(adicional) {
                            id = _.pluck(adicional.opcoes, ['id']);
                            id = (id).toString().split(',');
                            opcoesPermitidas.push(id);
                        });
                    }
                });
                return _.chain(opcoesPermitidas).flatten().uniq().sortBy().value();
            },
            getById: function(additionalId) {
                if ('undefined' === typeof additionalId) { return undefined; }

                return _.chain(cart.selection).map(function(produto) {
                    return _(produto.adicionais).map(function(adicional) {
                        return _(adicional.opcoes).filter(function(opcao) {
                            return (opcao.id).toString() === (additionalId).toString();
                        });
                    });
                }).flatten().compact().first().value();
            },
            add: function(additionalIds) {
                var adicional, additionaisPermitidosIds, values = this.values;
                additionalIds = additionalIds || options.additionalIds;
                if (!additionalIds) { return false; }

                if (!_.isArray(additionalIds)) {
                    additionalIds = !!_.isString(additionalIds) ? additionalIds.split(',') : [(additionalIds).toString()];
                }

                additionaisPermitidosIds = _.intersection(additionalIds,this.permitidos());
                additionaisNaoPermitidosIds = _.difference(additionalIds,this.permitidos());

                _.each(additionaisNaoPermitidosIds, function(additionalId) {
                    delete values[additionalId];
                });
                _.each(additionaisPermitidosIds, function(additionalId) {
                    adicional = cart.adicionais.getById(additionalId);
                    if (!!adicional) {
                        values[additionalId] = adicional;
                        if (!adicional.multipleChoice) {
                            cart.adicionais.remove(adicional.otherOptions);
                        }
                    } else {
                        delete values[additionalId];
                    }
                });
                this.length = _.size(this.values);
                this.keys = _.keys(this.values);
            },
            remove: function(additionalIds) {
                var adicional, values = this.values;
                additionalIds = additionalIds || options.additionalIds;
                if (!additionalIds) { return false; }

                if (!_.isArray(additionalIds)) {
                    additionalIds = !!_.isString(additionalIds) ? additionalIds.split(',') : [(additionalIds).toString()];
                }

                _.each(additionalIds, function(additionalId) {
                    delete values[additionalId];
                });

                this.length = _.size(this.values);
                this.keys = _.keys(this.values);
                options.additionalIds = this.keys;
            },
            clear: function(productType) {
                if ("undefined" === typeof productType){
                    this.values = {};
                    this.length = 0;
                    this.keys = [];
                } else if (!!cart.selection && !!cart.selection[productType]) {
                    var ids = _.map(cart.selection[productType].adicionais,function(adicional) {
                        id = _.pluck(adicional.opcoes,'id');
                        id = (id).toString();
                        return id;
                    }).toString().split(',');

                    this.remove(_.intersection(this.keys, ids));
                }
            }
        },

        addSelection: function(selectionIds) {
            if (selectionIds.comboId) {
                cart.addCombo(selectionIds.comboId);
            } else {
                _.each(['tv','internet','fone','celular'], function(product) {
                    cart.addProduct(product, selectionIds[product+"Id"]);
                });
            }
        },

        addProduct: function(productType, productId) {
            if (productType !== undefined && productId !== undefined) {
                var selection = cart.selection;

                delete cart.comboId;

                cart[productType + 'Id'] = productId;

                var selectedIds = new SelectIds(cart);
                selection = data.getSelection(selectedIds);

                if (!selection || !selection[productType]){
                    cart[productType + 'Id'] = data[productType + 'EmptyId'];
                }

                if (selection.combo) {
                    cart.comboId = selection.combo.id;
                }

                cart.selection = selection;
                cart.adicionais.add();
                cart.subprodutos.add();

                if (!!selection && !selection.combo) {
                    _.each(selection, function(product, type) {
                        if (!!product.somenteCombo) {
                            cart.removeProduct(type);
                        }
                    });
                }
            }
        },

        removeProduct : function(productType) {
            cart.adicionais.clear(productType);
            cart.subprodutos.clear(productType);
            return productType ?
                cart.addProduct(productType, data[productType + 'EmptyId']) : false;
        },

        addCombo : function(comboId) {
            var combo = data.getComboById(comboId);

            if (combo !== undefined) {
                var selectedIds = new SelectIds(privateData.combo[comboId]);
                selectedIds.comboId = comboId;
                _.extend(cart, selectedIds);

                cart.selection = combo;
                cart.adicionais.add();
                cart.subprodutos.add();
                cart.selection = data.getComboById(comboId);
            }
        },

        removeCombo : function() {
            return cart.clear();
        },

        getMontly : function(selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var additionals = (!options.ignoreAdditionals) ? cart.getAdditionals() : {preco:0};
            var subproducts = (!options.ignoreAdditionals) ? cart.getSubProductsMontly() : 0;
            return parseInt(
                (additionals           ? additionals.preco        : 0) +
                (subproducts           ? subproducts              : 0) +
                (selection.tv          ? selection.tv.preco       : 0) +
                (selection.internet    ? selection.internet.preco : 0) +
                (selection.fone        ? selection.fone.preco     : 0) +
                (selection.celular     ? selection.celular.preco  : 0), 10);
        },

        getMontlyFrom : function(selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var additionals = (!options.ignoreAdditionals) ? cart.getAdditionals() : {precoDe:0};
            var subproducts = (!options.ignoreAdditionals) ? cart.getSubProductsMontly() : 0;
            var montlyFrom = parseInt(
                (additionals           ? additionals.precoDe        : 0) +
                (subproducts           ? subproducts                : 0) +
                (selection.tv          ? selection.tv.precoDe       : 0) +
                (selection.internet    ? selection.internet.precoDe : 0) +
                (selection.fone        ? selection.fone.precoDe     : 0) +
                (selection.celular     ? selection.celular.precoDe  : 0), 10);

            return (montlyFrom !== cart.getMontly(selection) ? montlyFrom : undefined);
        },

        getSignup : function(selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var additionals = (!options.ignoreAdditionals) ? cart.getAdditionals() : {adesao:0};
            return parseInt(
                (additionals           ? additionals.adesao        : 0) +
                (selection.tv          ? selection.tv.adesao       : 0) +
                (selection.internet    ? selection.internet.adesao : 0) +
                (selection.fone        ? selection.fone.adesao     : 0) +
                (selection.celular     ? selection.celular.adesao  : 0), 10);
        },

        getSignupInstallments : function(selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var installments = {},
                adesao = cart.getSignup(selection, options) || 0,
                menorParcela = _.chain(selection).pluck('adesaoParcelas').compact().min().value();

            installments.parcelas = menorParcela < Infinity ? menorParcela : 1;
            installments.valor = Math.ceil(adesao/installments.parcelas);
            installments.texto = installments.parcelas + 'x de ' + installments.valor.currency().toString();

            return installments;
        },
        getSignupPrePaid : function(selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var payment = _.findWhere(selection, {adesaoPrePaga: 1});
            return !!payment;
        },

        getInstallation : function(selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var additionals = (!options.ignoreAdditionals) ? cart.getAdditionals() : {taxaInstalacao:0};
            return parseInt(
                (additionals           ? additionals.taxaInstalacao        : 0) +
                (selection.tv          ? selection.tv.taxaInstalacao       : 0) +
                (selection.internet    ? selection.internet.taxaInstalacao : 0) +
                (selection.fone        ? selection.fone.taxaInstalacao     : 0) +
                (selection.celular     ? selection.celular.taxaInstalacao  : 0), 10);
        },

        getAdditionals: function(adicionais) {
            adicionais = adicionais || cart.adicionais.values || {};
            var valores = {
                preco:          0,
                precoDe:        0,
                adesao:         0,
                taxaInstalacao: 0
            };

            _.each(adicionais, function(adicional) {
                valores.preco           += adicional.preco          || 0;
                valores.precoDe         += adicional.precoDe        || 0;
                valores.adesao          += adicional.adesao         || 0;
                valores.taxaInstalacao  += adicional.taxaInstalacao || 0;
            });
            return valores;
        },

        getSubProducts: function(subproducts) {
            subproducts = subproducts || cart.subprodutos.values || {};
            var valores = {
                preco:          0,
                precoDe:        0,
                periodos:       []
            };

            _.each(subproducts, function(subproduct) {
                valores.preco           += subproduct.preco          || 0;
                valores.precoDe         += subproduct.precoDe        || 0;

                _.each(subproduct.periodos, function(periodo, mes) {
                    valores.periodos[mes] = (valores.periodos[mes] || 0 ) + periodo;
                })
            });
            return valores;
        },

        getSubProductsMontly: function(subproducts) {
            subproducts = subproducts || cart.subprodutos.values || {};
            var preco = 0;

            _.each(subproducts, function(subproduct) {
                preco += subproduct.preco          || 0;
            });
            return preco;
        },

        getSubProductsMontlyFrom: function(subproducts) {
            subproducts = subproducts || cart.subprodutos.values || {};
            var precoDe = 0;

            _.each(subproducts, function(subproduct) {
                precoDe += subproduct.precoDe          || 0;
            });
            return precoDe;
        },

        getPeriodos: function (selection, options) {
            selection = selection || cart.selection;
            options = options || {};
            var additionals = (!options.ignoreAdditionals) ? cart.getAdditionals() : {preco:0, precoDe:0, adesao:0, taxaInstalacao:0 };
            var subproducts = (!options.ignoreAdditionals) ? cart.getSubProducts() : {preco:0, precoDe:0};
            var i,
                periodos = [],
                valoresPeriodos = {};

            if (!!selection) {
                for (var mes = 12; mes>=0; mes--) {
                    var preco = 0;

                    if (selection.tv) {
                        preco += selection.tv.periodos && selection.tv.periodos[mes] >= 0 ? selection.tv.periodos[mes] : selection.tv.preco ;
                    }
                    if (selection.internet) {
                        preco += selection.internet.periodos && selection.internet.periodos[mes] >= 0 ? selection.internet.periodos[mes] : selection.internet.preco ;
                    }
                    if (selection.fone) {
                        preco += selection.fone.periodos && selection.fone.periodos[mes] >= 0 ? selection.fone.periodos[mes] : selection.fone.preco ;
                    }
                    if (selection.celular) {
                        preco += selection.celular.periodos && selection.celular.periodos[mes] >= 0 ? selection.celular.periodos[mes] : selection.celular.preco ;
                    }
                    if (additionals) {
                        preco += additionals.periodos && additionals.periodos[mes] >= 0 ? additionals.periodos[mes] : additionals.preco ;
                    }
                    if (subproducts) {
                        preco += subproducts.periodos && subproducts.periodos[mes] >= 0 ? subproducts.periodos[mes] : subproducts.preco ;
                    }
                    valoresPeriodos[mes+1] = preco;
                }
            }

            _.each(valoresPeriodos, function(periodo,mes) {
                var obj = {};
                obj.mes = mes;
                obj.atual = periodo;
                obj.anterior = valoresPeriodos[parseInt(mes, 10)-1] || 0;

                if (obj.atual !== obj.anterior || mes === '1') {
                    periodos.push(obj);
                }
            });

            _.each(periodos, function(obj, i) {
                var ultimoMes = !!periodos[i+1] ? periodos[i+1].mes - 1  : null;
                obj.ultimoMes = ultimoMes ? ultimoMes.toString() : null;
                obj.proximo = ultimoMes && (ultimoMes+1) && valoresPeriodos[ultimoMes + 1];
                periodos[i] = obj;
            });

            return periodos;
        },

        getPrimeiroPeriodo: function(selection) {
            var periodos = cart.getPeriodos(selection),
                primeiroPeriodo = _.first(periodos),
                primeiroPeriodoPreco;

            primeiroPeriodoPreco = (!!primeiroPeriodo) ?
                primeiroPeriodo.atual :
                cart.getMontly(selection);
            return primeiroPeriodoPreco;
        },

        getUltimoPeriodo: function(selection) {
            var periodos = cart.getPeriodos(selection),
                ultimoPeriodo = _.last(periodos),
                ultimoPeriodoPreco;

            ultimoPeriodoPreco = (!!ultimoPeriodo)?
                ultimoPeriodo.atual :
                cart.getMontlyFrom(selection);
            return ultimoPeriodoPreco;
        }
    };

    var usp = { //UpsellingParser
        init : function(url, callback) {
            if(!url) { throw new TypeError('UpsellingParser::init: URL cannot be null'); }
            if(!callback) { throw new TypeError('UpsellingParser::init: Callback cannot be null'); }

            if(usp.loading !== true) {
                usp.loading = true;

                usp.fetchData(url, function(uspData){
                    usp.loading = false;
                    callback(uspData.upselling);
                });
            } else {
                var waitForData = setInterval(function(){
                    if(usp.loading !== true) {
                        clearInterval(waitForData);
                        callback(data.upselling);
                    }
                }, 500);
            }
        },

        fetchData : function(url, success, error){
            if(!url) { throw new TypeError('UpsellingParser::fetchData: URL cannot be null'); }
            if(!success) { throw new TypeError('UpsellingParser::fetchData: Success callback cannot be null'); }
            error = error || function(){};

            var dataTimestamp = new Date();
            var timestamp = [dataTimestamp.getFullYear(), dataTimestamp.getMonth() + 1, dataTimestamp.getDate(), dataTimestamp.getHours(), (dataTimestamp.getMinutes() < 30 ? '00' : '30' )].join('');

            if(self.fetch) {

                var reqOpts = {
                    method: 'GET',
                    cache: 'default'
                };

                fetch(new Request(url, reqOpts))
                    .then(function(response) { return response.json(); })
                    .then(function(json) { return success(json); })
                    .catch(function(err) { console.error(err); return error(err) });

            } else {
                /*
                var xhr = new XMLHttpRequest();

                xhr.responseType = "json";
                xhr.onload = function() { return success(this.response); };
                xhr.onerror = function () { console.error(xhr.status); return error(xhr.status);};
                xhr.open("GET", url);
                xhr.send();
                */
                $.ajax({
                    url : url,
                    cache: true,
                    dataType : 'json',
                    async: false,
                    type : 'GET',
                    success : function(jsonData, textStatus, jqXHR) {
                        success(jsonData);
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.log('error:', jqXHR, textStatus, errorThrown);
                        return error(textStatus);
                    }
                });
            }
        },

        filterSuggestions : function(uspData, productIds, callback, documentType) {
            if(!uspData) { throw new TypeError('UpsellingParser::filterSuggestions: Upselling data cannot be null'); }
            if(!productIds) { throw new TypeError('UpsellingParser::filterSuggestions: ProductIds cannot be null'); }
            if(!callback) { throw new TypeError('UpsellingParser::filterSuggestions: Callback cannot be null'); }

            var regras = uspData.filter(function(regra){
                return (
                    (!options.empresas || typeof documentType === 'undefined' || documentType === 'cpf' && regra.showCpf || documentType === 'cnpj'&& regra.showCnpj) &&
                    (productIds.tvId === regra.tvIds || (regra.tvIds && regra.tvIds.indexOf(productIds.tvId) >= 0)) &&
                    (productIds.internetId === regra.internetIds || (regra.internetIds && regra.internetIds.indexOf(productIds.internetId) >= 0)) &&
                    (productIds.foneId === regra.foneIds || (regra.foneIds && regra.foneIds.indexOf(productIds.foneId) >= 0)) &&
                    (productIds.celularId === regra.celularIds || (regra.celularIds && regra.celularIds.indexOf(productIds.celularId) >= 0))
                )
            });
            return callback(regras);
        }
    };

    return this.init();
};
